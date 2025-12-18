package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log"
	"sync"
)

type BotManager struct {
	client      *MewClient
	serviceType string

	mu   sync.Mutex
	bots map[string]*runningBot
}

type runningBot struct {
	configHash string
	stop       func()
}

func NewBotManager(client *MewClient, serviceType string) *BotManager {
	return &BotManager{
		client:      client,
		serviceType: serviceType,
		bots:        make(map[string]*runningBot),
	}
}

func (m *BotManager) StopAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for id, rb := range m.bots {
		log.Printf("[test-bot] stopping bot %s", id)
		rb.stop()
		delete(m.bots, id)
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

	m.mu.Lock()
	defer m.mu.Unlock()

	for _, bot := range bots {
		botID := bot.ID
		seen[botID] = struct{}{}

		configHash := sha256String(bot.Config)
		if existing, ok := m.bots[botID]; ok && existing.configHash == configHash {
			continue
		}

		if existing, ok := m.bots[botID]; ok {
			log.Printf("[test-bot] reloading bot %s (%s)", botID, bot.Name)
			existing.stop()
			delete(m.bots, botID)
		} else {
			log.Printf("[test-bot] starting bot %s (%s)", botID, bot.Name)
		}

		runner, err := NewTestBotRunner(botID, bot.Name, bot.Config)
		if err != nil {
			log.Printf("[test-bot] invalid config for bot %s (%s): %v", botID, bot.Name, err)
			continue
		}

		stopFn := runner.Start()
		m.bots[botID] = &runningBot{configHash: configHash, stop: stopFn}
	}

	for botID, rb := range m.bots {
		if _, ok := seen[botID]; ok {
			continue
		}
		log.Printf("[test-bot] stopping bot %s (no longer in bootstrap list)", botID)
		rb.stop()
		delete(m.bots, botID)
	}

	return nil
}

func sha256String(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}
