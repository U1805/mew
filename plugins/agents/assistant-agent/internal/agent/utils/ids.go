package utils

import (
	"crypto/rand"
	"fmt"
	"strings"
)

// CollectIDs 提取切片元素的 ID 字段（由回调提供），并返回原顺序的 ID 列表。
//
// 用途：将 “从已有结构里收集 ID 字段” 的逻辑统一放在 utils，避免在各处重复写 summaryIDs/factIDs。
func CollectIDs[T any](items []T, id func(T) string) []string {
	if len(items) == 0 || id == nil {
		return nil
	}
	out := make([]string, 0, len(items))
	for _, it := range items {
		out = append(out, id(it))
	}
	return out
}

// NextIDRandomHex4 生成不可变短随机 ID：{prefix}{hhhh}（4 位小写 16 进制）。
//
// 空间为 16^4=65536。用于单用户“几百条记忆”的场景，碰撞概率极低，且会在生成时检测并重试。
func NextIDRandomHex4(existing []string, prefix byte) string {
	used := make(map[string]struct{}, len(existing))
	for _, id := range existing {
		t := strings.ToLower(strings.TrimSpace(id))
		if t == "" {
			continue
		}
		used[t] = struct{}{}
	}

	// Fast path: random retry a few times (collisions should be extremely rare).
	for i := 0; i < 128; i++ {
		v, ok := randUint16()
		if !ok {
			break
		}
		cand := fmt.Sprintf("%c%04x", prefix, v)
		if _, ok := used[strings.ToLower(cand)]; !ok {
			return cand
		}
	}

	// Worst-case fallback: pick a random start point and scan the whole space.
	start := uint16(0)
	if v, ok := randUint16(); ok {
		start = v
	}
	for i := 0; i < 1<<16; i++ {
		v := uint16((int(start) + i) & 0xffff)
		cand := fmt.Sprintf("%c%04x", prefix, v)
		if _, ok := used[strings.ToLower(cand)]; !ok {
			return cand
		}
	}

	// Space exhausted (should be impossible for our use-case); best-effort return.
	return fmt.Sprintf("%c%04x", prefix, start)
}

func randUint16() (uint16, bool) {
	var b [2]byte
	if _, err := rand.Read(b[:]); err != nil {
		return 0, false
	}
	return uint16(b[0])<<8 | uint16(b[1]), true
}
