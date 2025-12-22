package core

import "testing"

func TestBoolOrDefault(t *testing.T) {
	if got := BoolOrDefault(nil, true); got != true {
		t.Fatalf("nil => def, got %v", got)
	}
	if got := BoolOrDefault(nil, false); got != false {
		t.Fatalf("nil => def, got %v", got)
	}

	v := false
	if got := BoolOrDefault(&v, true); got != false {
		t.Fatalf("ptr => value, got %v", got)
	}
}

func TestIsEnabled(t *testing.T) {
	if got := IsEnabled(nil); got != true {
		t.Fatalf("nil should be enabled by default, got %v", got)
	}

	v := false
	if got := IsEnabled(&v); got != false {
		t.Fatalf("ptr false should be disabled, got %v", got)
	}
}

