package store

import (
	"os"
	"path/filepath"

	"mew/plugins/sdk"
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

func LoadFacts(path string) (FactsFile, error) {
	v, err := sdk.LoadJSONFile[FactsFile](path)
	if err != nil {
		if os.IsNotExist(err) {
			return FactsFile{Facts: []Fact{}}, nil
		}
		return FactsFile{}, err
	}
	if v.Facts == nil {
		v.Facts = []Fact{}
	}
	return v, nil
}

func SaveFacts(path string, v FactsFile) error {
	if v.Facts == nil {
		v.Facts = []Fact{}
	}
	return sdk.SaveJSONFileIndented(path, v)
}

func LoadSummaries(path string) (SummariesFile, error) {
	v, err := sdk.LoadJSONFile[SummariesFile](path)
	if err != nil {
		if os.IsNotExist(err) {
			return SummariesFile{Summaries: []Summary{}}, nil
		}
		return SummariesFile{}, err
	}
	if v.Summaries == nil {
		v.Summaries = []Summary{}
	}
	return v, nil
}

func SaveSummaries(path string, v SummariesFile) error {
	if v.Summaries == nil {
		v.Summaries = []Summary{}
	}
	return sdk.SaveJSONFileIndented(path, v)
}

func LoadMetadata(path string) (Metadata, error) {
	v, err := sdk.LoadJSONFile[Metadata](path)
	if err != nil {
		if os.IsNotExist(err) {
			return Metadata{BaselineMood: DefaultBaselineMood()}, nil
		}
		return Metadata{}, err
	}
	if v.BaselineMood == (Mood{}) {
		v.BaselineMood = DefaultBaselineMood()
	}
	return v, nil
}

func SaveMetadata(path string, v Metadata) error {
	if v.BaselineMood == (Mood{}) {
		v.BaselineMood = DefaultBaselineMood()
	}
	return sdk.SaveJSONFileIndented(path, v)
}
