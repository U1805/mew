package proxy

import "testing"

func TestSplitEnvList(t *testing.T) {
	got := splitEnvList(" a,b ;c \n d\t\re  a ")
	want := []string{"a", "b", "c", "d", "e"}
	if len(got) != len(want) {
		t.Fatalf("len=%d want=%d got=%v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("i=%d got=%q want=%q (all=%v)", i, got[i], want[i], got)
		}
	}
}

