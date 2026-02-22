package httpx

import (
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"os"
	"strings"
	"time"
)

const (
	ModeDirect = "direct"
	ModeEnv    = "env"
	ModeProxy  = "proxy"
)

type ClientOptions struct {
	Timeout time.Duration

	// Mode controls the request path:
	// - "direct": explicit direct connection.
	// - "env": use ProxyFromEnvironment.
	// - "proxy": proxy-pool first, then env proxy (if configured), then direct.
	// - empty: resolve from MEW_API_PROXY.
	Mode string

	// Proxy is an internal override for explicit fallback proxy URL.
	Proxy string

	// CookieJar enables a cookie jar (required by some scrapers).
	CookieJar bool

	// Transport allows providing a pre-configured transport.
	// When nil, it clones http.DefaultTransport.
	Transport *http.Transport
}

func NewClient(opts ClientOptions) (*http.Client, error) {
	var base *http.Transport
	if opts.Transport != nil {
		base = opts.Transport.Clone()
	} else {
		base = http.DefaultTransport.(*http.Transport).Clone()
	}

	mode := strings.ToLower(strings.TrimSpace(opts.Mode))
	if mode == "" {
		var err error
		mode, err = resolveModeFromEnv()
		if err != nil {
			return nil, err
		}
	}

	var rt http.RoundTripper
	switch mode {
	case ModeDirect:
		direct := base.Clone()
		direct.Proxy = nil
		rt = direct
	case ModeEnv:
		env := base.Clone()
		env.Proxy = http.ProxyFromEnvironment
		rt = env
	case ModeProxy:
		poolFirst := NewTransport(base.Clone())

		var fallback http.RoundTripper
		if strings.TrimSpace(opts.Proxy) != "" {
			fb := base.Clone()
			proxyFunc, err := ProxyFuncFromString(opts.Proxy)
			if err != nil {
				return nil, err
			}
			fb.Proxy = proxyFunc
			fallback = fb
		} else {
			if hasEnvProxyConfigured() {
				fb := base.Clone()
				fb.Proxy = http.ProxyFromEnvironment
				fallback = fb
			}
		}

		direct := base.Clone()
		direct.Proxy = nil
		rt = &fallbackRoundTripper{
			primary:   poolFirst,
			fallback:  fallback,
			direct:    direct,
			tryDirect: true,
		}
	default:
		return nil, fmt.Errorf("invalid mode %q (expected %q, %q or %q)", mode, ModeDirect, ModeEnv, ModeProxy)
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
		Transport: rt,
		Jar:       jar,
	}, nil
}

func normalizeMode(raw string) (string, error) {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" {
		return ModeDirect, nil
	}
	switch s {
	case "0", "false", "off", "no", "none", "direct":
		return ModeDirect, nil
	case "env":
		return ModeEnv, nil
	case "proxy":
		return ModeProxy, nil
	default:
		return "", fmt.Errorf("invalid MEW_API_PROXY=%q (only \"env\", \"proxy\" or \"direct\")", raw)
	}
}

func resolveModeFromEnv() (string, error) {
	return normalizeMode(strings.TrimSpace(os.Getenv("MEW_API_PROXY")))
}

func hasEnvProxyConfigured() bool {
	return strings.TrimSpace(os.Getenv("HTTP_PROXY")) != "" || strings.TrimSpace(os.Getenv("HTTPS_PROXY")) != ""
}

type fallbackRoundTripper struct {
	primary  http.RoundTripper
	fallback http.RoundTripper
	direct   http.RoundTripper

	// tryDirect means: after fallback fails, try direct once more.
	// This is used when fallback is env or explicit Proxy override semantics.
	tryDirect bool
}

func (t *fallbackRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	if t == nil || t.primary == nil {
		return http.DefaultTransport.RoundTrip(req)
	}

	resp, err := t.primary.RoundTrip(req)
	if err == nil {
		return resp, nil
	}

	if t.fallback != nil {
		req2, cloneErr := cloneRequestForRetry(req)
		if cloneErr != nil {
			return nil, err
		}
		resp2, err2 := t.fallback.RoundTrip(req2)
		if err2 == nil {
			return resp2, nil
		}
		if !t.tryDirect || t.direct == nil {
			return nil, err2
		}
		req3, cloneErr := cloneRequestForRetry(req)
		if cloneErr != nil {
			return nil, err2
		}
		return t.direct.RoundTrip(req3)
	}

	if !t.tryDirect || t.direct == nil {
		return nil, err
	}
	req2, cloneErr := cloneRequestForRetry(req)
	if cloneErr != nil {
		return nil, err
	}
	return t.direct.RoundTrip(req2)
}

func cloneRequestForRetry(req *http.Request) (*http.Request, error) {
	if req == nil {
		return nil, fmt.Errorf("nil request")
	}
	r2 := req.Clone(req.Context())
	if req.Body == nil || req.Body == http.NoBody {
		return r2, nil
	}
	if req.GetBody == nil {
		return nil, fmt.Errorf("request body is not replayable")
	}
	b, err := req.GetBody()
	if err != nil {
		return nil, err
	}
	r2.Body = b
	return r2, nil
}
