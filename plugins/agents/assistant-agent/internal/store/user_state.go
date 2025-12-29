package store

type Store struct {
	ServiceType string
	BotID       string
}

func NewStore(serviceType, botID string) *Store {
	return &Store{ServiceType: serviceType, BotID: botID}
}

type UserContext struct {
	Meta      Metadata
	Facts     FactsFile
	Summaries SummariesFile
}

func (s *Store) Paths(userID string) UserStatePaths {
	return UserStatePathsFor(s.ServiceType, s.BotID, userID)
}

func (s *Store) LoadUserContext(userID string) (UserContext, error) {
	paths := s.Paths(userID)
	facts, err := LoadFacts(paths.FactsPath)
	if err != nil {
		return UserContext{}, err
	}
	summaries, err := LoadSummaries(paths.SummariesPath)
	if err != nil {
		return UserContext{}, err
	}
	meta, err := LoadMetadata(paths.MetadataPath)
	if err != nil {
		return UserContext{}, err
	}
	return UserContext{Meta: meta, Facts: facts, Summaries: summaries}, nil
}

func (s *Store) SaveUserContext(userID string, ctx UserContext) error {
	paths := s.Paths(userID)
	if err := SaveFacts(paths.FactsPath, ctx.Facts); err != nil {
		return err
	}
	if err := SaveSummaries(paths.SummariesPath, ctx.Summaries); err != nil {
		return err
	}
	if err := SaveMetadata(paths.MetadataPath, ctx.Meta); err != nil {
		return err
	}
	return nil
}
