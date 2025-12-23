package main

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"
)

func randomAlphaNum(length int) string {
	if length <= 0 {
		return "0"
	}
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	var b strings.Builder
	b.Grow(length)

	max := big.NewInt(int64(len(chars)))
	for i := 0; i < length; i++ {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return fmt.Sprintf("%d", i)
		}
		b.WriteByte(chars[n.Int64()])
	}
	return b.String()
}

