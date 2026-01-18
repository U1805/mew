package httpx

import (
	"net/http"
	"net/http/cookiejar"
	"os"
	"strings"
	"time"
)

type ClientOptions struct {
	Timeout time.Duration

	// UseMEWProxy applies MEW_API_PROXY semantics:
	// - default: keep transport.Proxy as-is (http.DefaultTransport clones use ProxyFromEnvironment)
	// - "env": ProxyFromEnvironment
	// - URL / host:port: fixed proxy
	UseMEWProxy bool

	// Proxy overrides UseMEWProxy when non-empty.
	Proxy string

	// CookieJar enables a cookie jar (required by some scrapers).
	CookieJar bool

	// Transport allows providing a pre-configured transport.
	// When nil, it clones http.DefaultTransport.
	Transport *http.Transport
}

func NewClient(opts ClientOptions) (*http.Client, error) {
	var transport *http.Transport
	if opts.Transport != nil {
		transport = opts.Transport.Clone()
	} else {
		transport = http.DefaultTransport.(*http.Transport).Clone()
	}

	proxyRaw := strings.TrimSpace(opts.Proxy)
	if proxyRaw != "" {
		proxyFunc, err := ProxyFuncFromString(proxyRaw)
		if err != nil {
			return nil, err
		}
		transport.Proxy = proxyFunc
	} else if opts.UseMEWProxy {
		if raw := strings.TrimSpace(os.Getenv("MEW_API_PROXY")); raw != "" {
			proxyFunc, err := ProxyFuncFromString(raw)
			if err != nil {
				return nil, err
			}
			transport.Proxy = proxyFunc
		}
	} else {
		transport.Proxy = nil // default: no proxy (even if HTTP_PROXY / HTTPS_PROXY is set)
	}

	var jar http.CookieJar
	if opts.CookieJar {
		jar, _ = cookiejar.New(nil)
	}

	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = 15 * time.Second
	}

	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
		Jar:       jar,
	}, nil
}
