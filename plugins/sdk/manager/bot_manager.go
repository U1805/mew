package manager

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log"
	"sync"

	"mew/plugins/sdk/mew"
)

type Runner interface {
	Run(ctx context.Context) error
}

type RunnerFactory func(botID, botName, accessToken, rawConfig string) (Runner, error)

type BotManager struct {
	client      *mew.Client
	serviceType string
	logPrefix   string
	newRunner   RunnerFactory

	mu   sync.Mutex
	bots map[string]*runningBot
}

type runningBot struct {
	configHash string
	cancel     context.CancelFunc
	done       chan struct{}
}

func NewBotManager(client *mew.Client, serviceType, logPrefix string, factory RunnerFactory) *BotManager {
	return &BotManager{
		client:      client,
		serviceType: serviceType,
		logPrefix:   logPrefix,
		newRunner:   factory,
		bots:        make(map[string]*runningBot),
	}
}

func (m *BotManager) StopAll() {
	m.mu.Lock()
	toStop := make([]*runningBot, 0, len(m.bots))
	for id, rb := range m.bots {
		log.Printf("%s stopping bot %s", m.logPrefix, id)
		toStop = append(toStop, rb)
		delete(m.bots, id)
	}
	m.mu.Unlock()

	for _, rb := range toStop {
		rb.cancel()
		<-rb.done
	}
}

func (m *BotManager) SyncOnce(ctx context.Context) error {
	if err := m.client.RegisterServiceType(ctx, m.serviceType); err != nil {
		return err
	}

	bots, err := m.client.BootstrapBots(ctx, m.serviceType)
	if err != nil {
		return err
	}

	seen := make(map[string]struct{}, len(bots))

	type startReq struct {
		botID       string
		botName     string
		accessToken string
		rawConfig   string
		configHash  string
	}

	var (
		starts []startReq
		stops  []*runningBot
	)

	m.mu.Lock()
	for _, bot := range bots {
		botID := bot.ID
		seen[botID] = struct{}{}

		configHash := sha256String(bot.Config)
		if existing, ok := m.bots[botID]; ok {
			if existing.configHash == configHash {
				continue
			}
			log.Printf("%s reloading bot %s (%s)", m.logPrefix, botID, bot.Name)
			stops = append(stops, existing)
			delete(m.bots, botID)
		} else {
			log.Printf("%s starting bot %s (%s)", m.logPrefix, botID, bot.Name)
		}

		starts = append(starts, startReq{
			botID:       botID,
			botName:     bot.Name,
			accessToken: bot.AccessToken,
			rawConfig:   bot.Config,
			configHash:  configHash,
		})
	}

	for botID, rb := range m.bots {
		if _, ok := seen[botID]; ok {
			continue
		}
		log.Printf("%s stopping bot %s (no longer in bootstrap list)", m.logPrefix, botID)
		stops = append(stops, rb)
		delete(m.bots, botID)
	}
	m.mu.Unlock()

	for _, rb := range stops {
		rb.cancel()
		<-rb.done
	}

	for _, s := range starts {
		runner, err := m.newRunner(s.botID, s.botName, s.accessToken, s.rawConfig)
		if err != nil {
			log.Printf("%s invalid config for bot %s (%s): %v", m.logPrefix, s.botID, s.botName, err)
			continue
		}

		botCtx, cancel := context.WithCancel(ctx)
		done := make(chan struct{})
		go func(botID, botName string) {
			defer close(done)
			if err := runner.Run(botCtx); err != nil && !errors.Is(err, context.Canceled) {
				log.Printf("%s bot crashed: bot=%s name=%q err=%v", m.logPrefix, botID, botName, err)
			}
		}(s.botID, s.botName)

		m.mu.Lock()
		m.bots[s.botID] = &runningBot{configHash: s.configHash, cancel: cancel, done: done}
		m.mu.Unlock()
	}

	return nil
}

func sha256String(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}
