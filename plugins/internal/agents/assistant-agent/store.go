package agent

import (
	"os"
	"path/filepath"

	"mew/plugins/internal/agents/assistant-agent/memory"
	"mew/plugins/internal/agents/assistant-agent/proactive"
	"mew/plugins/pkg"
)

type UserStatePaths struct {
	UserDir       string
	FactsPath     string
	SummariesPath string
	MetadataPath  string
	ProactivePath string
}

func UserStatePathsFor(serviceType, botID, userID string) UserStatePaths {
	base := sdk.BotStateDir(serviceType, botID)
	userDir := filepath.Join(base, "users", userID)
	return UserStatePaths{
		UserDir:       userDir,
		FactsPath:     filepath.Join(userDir, "facts.json"),
		SummariesPath: filepath.Join(userDir, "summaries.json"),
		MetadataPath:  filepath.Join(userDir, "metadata.json"),
		ProactivePath: filepath.Join(userDir, "proactive.json"),
	}
}

func LoadJSONFile[T any](path string) (T, error) {
	return sdk.LoadJSONFile[T](path)
}

func SaveJSONFileIndented(path string, v any) error {
	return sdk.SaveJSONFileIndented(path, v)
}

func LoadFacts(path string) (memory.FactsFile, error) {
	v, err := LoadJSONFile[memory.FactsFile](path)
	if err != nil {
		if os.IsNotExist(err) {
			return memory.FactsFile{Facts: []memory.Fact{}}, nil
		}
		return memory.FactsFile{}, err
	}
	if v.Facts == nil {
		v.Facts = []memory.Fact{}
	}
	return v, nil
}

func SaveFacts(path string, v memory.FactsFile) error {
	if v.Facts == nil {
		v.Facts = []memory.Fact{}
	}
	return SaveJSONFileIndented(path, v)
}

func LoadSummaries(path string) (memory.SummariesFile, error) {
	v, err := LoadJSONFile[memory.SummariesFile](path)
	if err != nil {
		if os.IsNotExist(err) {
			return memory.SummariesFile{Summaries: []memory.Summary{}}, nil
		}
		return memory.SummariesFile{}, err
	}
	if v.Summaries == nil {
		v.Summaries = []memory.Summary{}
	}
	return v, nil
}

func SaveSummaries(path string, v memory.SummariesFile) error {
	if v.Summaries == nil {
		v.Summaries = []memory.Summary{}
	}
	return SaveJSONFileIndented(path, v)
}

func LoadMetadata(path string) (memory.Metadata, error) {
	v, err := LoadJSONFile[memory.Metadata](path)
	if err != nil {
		if os.IsNotExist(err) {
			return memory.Metadata{BaselineMood: memory.DefaultBaselineMood()}, nil
		}
		return memory.Metadata{}, err
	}
	if v.BaselineMood == (memory.Mood{}) {
		v.BaselineMood = memory.DefaultBaselineMood()
	}
	return v, nil
}

func SaveMetadata(path string, v memory.Metadata) error {
	if v.BaselineMood == (memory.Mood{}) {
		v.BaselineMood = memory.DefaultBaselineMood()
	}
	return SaveJSONFileIndented(path, v)
}

func LoadProactiveQueue(path string) (proactive.ProactiveQueueFile, error) {
	v, err := LoadJSONFile[proactive.ProactiveQueueFile](path)
	if err != nil {
		if os.IsNotExist(err) {
			return proactive.ProactiveQueueFile{Requests: []proactive.ProactiveRequest{}}, nil
		}
		return proactive.ProactiveQueueFile{}, err
	}
	if v.Requests == nil {
		v.Requests = []proactive.ProactiveRequest{}
	}
	return v, nil
}

func SaveProactiveQueue(path string, v proactive.ProactiveQueueFile) error {
	if v.Requests == nil {
		v.Requests = []proactive.ProactiveRequest{}
	}
	return SaveJSONFileIndented(path, v)
}
