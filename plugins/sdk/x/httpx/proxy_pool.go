package httpx

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	netproxy "golang.org/x/net/proxy"
)

const defaultProxyListURL = "https://raw.githubusercontent.com/ClearProxy/checked-proxy-list/main/socks5/raw/all.txt"
const defaultProxyListCacheTTL = 5 * time.Minute

var ipPortRegex = regexp.MustCompile(`([0-9]{1,3}(?:\.[0-9]{1,3}){3}):([0-9]{1,5})`)

type Config struct {
	ProxyListURLs []string

	UpdateInterval          time.Duration
	HealthCheckConcurrency  int
	HealthCheckTotalTimeout time.Duration
	TLSHandshakeThreshold   time.Duration

	HealthCheckTargetAddr string // host:port
	HealthCheckSNI        string
}

func ConfigFromEnv() Config {
	cfg := Config{
		ProxyListURLs:           []string{defaultProxyListURL},
		UpdateInterval:          5 * time.Minute,
		HealthCheckConcurrency:  200,
		HealthCheckTotalTimeout: 8 * time.Second,
		TLSHandshakeThreshold:   5 * time.Second,
		HealthCheckTargetAddr:   "www.cloudflare.com:443",
		HealthCheckSNI:          "www.cloudflare.com",
	}

	if raw := strings.TrimSpace(os.Getenv("proxy_list_urls")); raw != "" {
		if urls := splitEnvList(raw); len(urls) > 0 {
			cfg.ProxyListURLs = urls
		}
	}
	// Explicitly allow disabling by setting proxy_list_urls to an empty/whitespace-only string.
	if _, ok := os.LookupEnv("proxy_list_urls"); ok && strings.TrimSpace(os.Getenv("proxy_list_urls")) == "" {
		cfg.ProxyListURLs = nil
	}

	return cfg
}

func splitEnvList(raw string) []string {
	f := func(r rune) bool {
		switch r {
		case ',', ';', '\n', '\r', '\t', ' ':
			return true
		default:
			return false
		}
	}

	parts := strings.FieldsFunc(raw, f)
	out := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, p := range parts {
		u := strings.TrimSpace(p)
		if u == "" {
			continue
		}
		if _, ok := seen[u]; ok {
			continue
		}
		seen[u] = struct{}{}
		out = append(out, u)
	}
	return out
}

type Pool struct {
	mu       sync.RWMutex
	proxies  []string
	idx      uint64
	updating int32

	cfg Config
	log *log.Logger
}

func NewPool(cfg Config) *Pool {
	return &Pool{
		proxies: make([]string, 0),
		cfg:     cfg,
		log:     log.New(log.Writer(), "[proxy] ", log.LstdFlags),
	}
}

func (p *Pool) StartBackground(ctx context.Context) {
	if len(p.cfg.ProxyListURLs) == 0 || p.cfg.UpdateInterval <= 0 {
		return
	}

	go func() {
		ticker := time.NewTicker(p.cfg.UpdateInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				p.UpdateNow(ctx)
			}
		}
	}()
}

func (p *Pool) UpdateNow(ctx context.Context) {
	if len(p.cfg.ProxyListURLs) == 0 {
		return
	}
	if !atomic.CompareAndSwapInt32(&p.updating, 0, 1) {
		return
	}
	defer atomic.StoreInt32(&p.updating, 0)

	// p.log.Printf("refreshing proxy pool from %d source(s)...", len(p.cfg.ProxyListURLs))

	raw, err := fetchProxyLists(ctx, p.cfg.ProxyListURLs)
	if err != nil {
		p.log.Printf("fetch proxy lists failed: %v", err)
		return
	}
	if len(raw) == 0 {
		p.log.Printf("no proxies fetched")
		return
	}

	healthy := p.healthCheck(ctx, raw)
	if len(healthy) == 0 {
		p.log.Printf("no healthy proxies after check (kept %d existing)", p.Len())
		return
	}

	p.mu.Lock()
	// old := len(p.proxies)
	p.proxies = healthy
	atomic.StoreUint64(&p.idx, 0)
	p.mu.Unlock()

	// p.log.Printf("proxy pool updated: %d -> %d", old, len(healthy))
}

func (p *Pool) Len() int {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return len(p.proxies)
}

func (p *Pool) GetNext() (string, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	if len(p.proxies) == 0 {
		return "", false
	}
	i := atomic.AddUint64(&p.idx, 1) % uint64(len(p.proxies))
	return p.proxies[i], true
}

func (p *Pool) healthCheck(ctx context.Context, proxies []string) []string {
	if len(proxies) == 0 {
		return nil
	}

	concurrency := p.cfg.HealthCheckConcurrency
	if concurrency <= 0 {
		concurrency = 200
	}

	timeout := p.cfg.HealthCheckTotalTimeout
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	threshold := p.cfg.TLSHandshakeThreshold
	if threshold <= 0 {
		threshold = 5 * time.Second
	}

	targetAddr := strings.TrimSpace(p.cfg.HealthCheckTargetAddr)
	if targetAddr == "" {
		targetAddr = "www.cloudflare.com:443"
	}
	sni := strings.TrimSpace(p.cfg.HealthCheckSNI)
	if sni == "" {
		sni = strings.Split(targetAddr, ":")[0]
	}

	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup
	var mu sync.Mutex
	healthy := make([]string, 0, len(proxies)/4)

	for _, proxyAddr := range proxies {
		addr := proxyAddr
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			ok := checkSOCKS5ProxyTLS(ctx, addr, targetAddr, sni, timeout, threshold)
			if !ok {
				return
			}
			mu.Lock()
			healthy = append(healthy, addr)
			mu.Unlock()
		}()
	}

	wg.Wait()
	return healthy
}

func checkSOCKS5ProxyTLS(parent context.Context, proxyAddr, targetAddr, sni string, totalTimeout, handshakeThreshold time.Duration) bool {
	ctx, cancel := context.WithTimeout(parent, totalTimeout)
	defer cancel()

	dialer, err := netproxy.SOCKS5("tcp", proxyAddr, nil, timeoutDialer{timeout: totalTimeout})
	if err != nil {
		return false
	}

	done := make(chan bool, 1)
	go func() {
		start := time.Now()

		conn, err := dialer.Dial("tcp", targetAddr)
		if err != nil {
			done <- false
			return
		}
		_ = conn.SetDeadline(time.Now().Add(totalTimeout))

		tlsConn := tls.Client(conn, &tls.Config{
			ServerName: sni,
			// Strict verify to filter out MITM / bad TLS proxies that would later fail
			// real HTTPS requests with "x509: certificate signed by unknown authority".
			InsecureSkipVerify: false,
		})
		if err := tlsConn.Handshake(); err != nil {
			_ = tlsConn.Close()
			done <- false
			return
		}

		elapsed := time.Since(start)
		_ = tlsConn.Close()

		if elapsed > handshakeThreshold {
			done <- false
			return
		}
		done <- true
	}()

	select {
	case ok := <-done:
		return ok
	case <-ctx.Done():
		return false
	}
}

type timeoutDialer struct {
	timeout time.Duration
}

func (d timeoutDialer) Dial(network, addr string) (net.Conn, error) {
	timeout := d.timeout
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	return net.DialTimeout(network, addr, timeout)
}

func proxyListCacheTTL() time.Duration {
	ttl := defaultProxyListCacheTTL
	if raw := strings.TrimSpace(os.Getenv("proxy_list_cache_ttl")); raw != "" {
		if parsed, err := time.ParseDuration(raw); err == nil {
			ttl = parsed
		}
	}
	return ttl
}

func proxyListCacheDir() string {
	// Keep consistent with plugin state directory layout: <base>/mew/plugins/<serviceType-or-shared>.
	if d, err := os.UserCacheDir(); err == nil && strings.TrimSpace(d) != "" {
		return filepath.Join(d, "mew", "plugins", "proxy")
	}
	// Fallback if user cache dir cannot be determined.
	return filepath.Join(os.TempDir(), "mew", "plugins", "proxy")
}

func proxyListCachePathForURL(url string) (cacheFile, lockFile string) {
	sum := sha256.Sum256([]byte(url))
	key := fmt.Sprintf("%x", sum[:])
	dir := proxyListCacheDir()
	return filepath.Join(dir, key+".txt"), filepath.Join(dir, key+".lock")
}

func readProxyListCacheIfFresh(cacheFile string, ttl time.Duration) ([]byte, bool) {
	info, err := os.Stat(cacheFile)
	if err != nil || info.IsDir() {
		return nil, false
	}
	if ttl > 0 && time.Since(info.ModTime()) > ttl {
		return nil, false
	}
	b, err := os.ReadFile(cacheFile)
	if err != nil || len(b) == 0 {
		return nil, false
	}
	return b, true
}

func readProxyListCacheAny(cacheFile string) ([]byte, bool) {
	b, err := os.ReadFile(cacheFile)
	if err != nil || len(b) == 0 {
		return nil, false
	}
	return b, true
}

func writeProxyListCache(cacheFile string, body []byte) error {
	dir := filepath.Dir(cacheFile)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	tmp, err := os.CreateTemp(dir, filepath.Base(cacheFile)+".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()

	_, writeErr := tmp.Write(body)
	closeErr := tmp.Close()
	if writeErr != nil {
		_ = os.Remove(tmpName)
		return writeErr
	}
	if closeErr != nil {
		_ = os.Remove(tmpName)
		return closeErr
	}

	// Best-effort: set mod time to now (used as fetchedAt).
	now := time.Now()
	_ = os.Chtimes(tmpName, now, now)

	// Windows can't rename over existing files; remove first.
	_ = os.Remove(cacheFile)
	if err := os.Rename(tmpName, cacheFile); err != nil {
		_ = os.Remove(tmpName)
		return err
	}
	return nil
}

func tryAcquireCacheLock(lockFile string) (release func(), ok bool) {
	dir := filepath.Dir(lockFile)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return func() {}, false
	}

	f, err := os.OpenFile(lockFile, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		// Best-effort: clear stale locks (e.g. a crashed process).
		if os.IsExist(err) {
			if info, statErr := os.Stat(lockFile); statErr == nil && !info.IsDir() && time.Since(info.ModTime()) > 30*time.Second {
				_ = os.Remove(lockFile)
				f, err = os.OpenFile(lockFile, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
			}
		}
		if err != nil {
			return func() {}, false
		}
	}
	_, _ = f.WriteString(strconv.FormatInt(time.Now().UnixNano(), 10))
	_ = f.Close()

	return func() { _ = os.Remove(lockFile) }, true
}

func fetchProxyListURLWithCache(ctx context.Context, client *http.Client, url string) ([]byte, error) {
	ttl := proxyListCacheTTL()
	cacheFile, lockFile := proxyListCachePathForURL(url)

	if ttl != 0 {
		if cached, ok := readProxyListCacheIfFresh(cacheFile, ttl); ok {
			return cached, nil
		}
	}

	// If caching is disabled, just fetch directly.
	if ttl == 0 {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, err
		}
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			_ = resp.Body.Close()
			return nil, fmt.Errorf("fetch %s status=%d", url, resp.StatusCode)
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, 32*1024*1024))
		_ = resp.Body.Close()
		return body, err
	}

	release, locked := tryAcquireCacheLock(lockFile)
	if locked {
		defer release()
		// Re-check after acquiring the lock in case another process updated the cache
		// between our first read and lock acquisition.
		if cached, ok := readProxyListCacheIfFresh(cacheFile, ttl); ok {
			return cached, nil
		}
	} else {
		// If another process is already fetching, wait briefly for its cache write.
		deadline := time.Now().Add(2 * time.Second)
		for time.Now().Before(deadline) {
			if cached, ok := readProxyListCacheIfFresh(cacheFile, ttl); ok {
				return cached, nil
			}
			time.Sleep(100 * time.Millisecond)
		}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		// On fetch failure, fall back to any cached body (even stale).
		if cached, ok := readProxyListCacheAny(cacheFile); ok {
			return cached, nil
		}
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		_ = resp.Body.Close()
		if cached, ok := readProxyListCacheAny(cacheFile); ok {
			return cached, nil
		}
		return nil, fmt.Errorf("fetch %s status=%d", url, resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 32*1024*1024))
	_ = resp.Body.Close()
	if err != nil {
		if cached, ok := readProxyListCacheAny(cacheFile); ok {
			return cached, nil
		}
		return nil, err
	}

	if ttl != 0 {
		_ = writeProxyListCache(cacheFile, body) // best-effort
	}
	return body, nil
}

func fetchProxyLists(ctx context.Context, urls []string) ([]string, error) {
	if len(urls) == 0 {
		return nil, nil
	}

	client := &http.Client{Timeout: 30 * time.Second}

	seen := make(map[string]struct{}, 64_000)
	out := make([]string, 0, 16_000)
	var lastErr error

	for _, u := range urls {
		u = strings.TrimSpace(u)
		if u == "" {
			continue
		}

		body, err := fetchProxyListURLWithCache(ctx, client, u)
		if err != nil {
			lastErr = err
			continue
		}

		scanner := bufio.NewScanner(bytes.NewReader(body))
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}

			// Fast-path known prefixes.
			line = strings.TrimPrefix(line, "socks5://")
			line = strings.TrimPrefix(line, "socks4://")
			line = strings.TrimPrefix(line, "https://")
			line = strings.TrimPrefix(line, "http://")

			hostPort := ""
			if m := ipPortRegex.FindStringSubmatch(line); len(m) >= 3 {
				hostPort = fmt.Sprintf("%s:%s", m[1], m[2])
			} else if strings.Contains(line, ":") && !strings.Contains(line, " ") && !strings.Contains(line, "\t") {
				hostPort = line
			}

			hostPort = strings.TrimSpace(hostPort)
			if hostPort == "" {
				continue
			}
			if _, ok := seen[hostPort]; ok {
				continue
			}
			seen[hostPort] = struct{}{}
			out = append(out, hostPort)
		}

		if err := scanner.Err(); err != nil {
			lastErr = err
		}
	}

	if len(out) == 0 && lastErr != nil {
		return nil, lastErr
	}
	return out, nil
}

type Manager struct {
	pool *Pool
	once sync.Once
}

func NewManager(cfg Config) *Manager {
	return &Manager{pool: NewPool(cfg)}
}

func (m *Manager) ensureStarted() {
	m.once.Do(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		defer cancel()
		m.pool.UpdateNow(ctx)
		m.pool.StartBackground(context.Background())
	})
}

func (m *Manager) DialContext(ctx context.Context, baseDial func(ctx context.Context, network, addr string) (net.Conn, error), network, addr string) (net.Conn, error) {
	m.ensureStarted()

	if m.pool.Len() == 0 {
		return baseDial(ctx, network, addr)
	}

	maxAttempts := 3
	if l := m.pool.Len(); l > 0 && l < maxAttempts {
		maxAttempts = l
	}

	var lastErr error
	for i := 0; i < maxAttempts; i++ {
		proxyAddr, ok := m.pool.GetNext()
		if !ok || proxyAddr == "" {
			break
		}

		dialer, err := netproxy.SOCKS5("tcp", proxyAddr, nil, timeoutDialer{timeout: 10 * time.Second})
		if err != nil {
			lastErr = err
			continue
		}

		conn, err := dialer.Dial(network, addr)
		if err == nil {
			return conn, nil
		}
		lastErr = err
	}

	if lastErr == nil {
		lastErr = errors.New("no proxy available")
	}
	// Fallback to direct connection.
	if conn, err := baseDial(ctx, network, addr); err == nil {
		return conn, nil
	}
	return nil, fmt.Errorf("dial via proxy failed: %w", lastErr)
}

var (
	defaultManagerOnce sync.Once
	defaultManager     *Manager
)

func Default() *Manager {
	defaultManagerOnce.Do(func() {
		defaultManager = NewManager(ConfigFromEnv())
	})
	return defaultManager
}

func NewTransport(base *http.Transport) *http.Transport {
	var t *http.Transport
	if base != nil {
		t = base.Clone()
	} else {
		t = http.DefaultTransport.(*http.Transport).Clone()
	}

	t.Proxy = nil

	baseDial := t.DialContext
	if baseDial == nil {
		d := (&net.Dialer{})
		baseDial = d.DialContext
	}

	t.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		return Default().DialContext(ctx, baseDial, network, addr)
	}

	return t
}
