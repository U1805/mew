package manager

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log"
	"sync"

	"mew/plugins/sdk/mew"
)

type Runner interface {
	Start() (stop func())
}

type RunnerFactory func(botID, botName, rawConfig string) (Runner, error)

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
	stop       func()
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
	stops := make([]func(), 0, len(m.bots))
	for id, rb := range m.bots {
		log.Printf("%s stopping bot %s", m.logPrefix, id)
		stops = append(stops, rb.stop)
		delete(m.bots, id)
	}
	m.mu.Unlock()

	for _, stop := range stops {
		stop()
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
		botID      string
		botName    string
		rawConfig  string
		configHash string
	}

	var (
		starts []startReq
		stops  []func()
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
			stops = append(stops, existing.stop)
			delete(m.bots, botID)
		} else {
			log.Printf("%s starting bot %s (%s)", m.logPrefix, botID, bot.Name)
		}

		starts = append(starts, startReq{
			botID:      botID,
			botName:    bot.Name,
			rawConfig:  bot.Config,
			configHash: configHash,
		})
	}

	for botID, rb := range m.bots {
		if _, ok := seen[botID]; ok {
			continue
		}
		log.Printf("%s stopping bot %s (no longer in bootstrap list)", m.logPrefix, botID)
		stops = append(stops, rb.stop)
		delete(m.bots, botID)
	}
	m.mu.Unlock()

	for _, stop := range stops {
		stop()
	}

	for _, s := range starts {
		runner, err := m.newRunner(s.botID, s.botName, s.rawConfig)
		if err != nil {
			log.Printf("%s invalid config for bot %s (%s): %v", m.logPrefix, s.botID, s.botName, err)
			continue
		}

		stopFn := runner.Start()

		m.mu.Lock()
		m.bots[s.botID] = &runningBot{configHash: s.configHash, stop: stopFn}
		m.mu.Unlock()
	}

	return nil
}

func sha256String(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}
