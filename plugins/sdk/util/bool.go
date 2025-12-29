package util

func BoolOrDefault(v *bool, def bool) bool {
	if v == nil {
		return def
	}
	return *v
}

func IsEnabled(v *bool) bool {
	return BoolOrDefault(v, true)
}
