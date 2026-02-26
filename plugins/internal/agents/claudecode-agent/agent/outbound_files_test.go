package agent

import (
	"errors"
	"strings"
	"testing"
)

func TestExtractFileRefSegments_Basic(t *testing.T) {
	in := "处理完成。\n\n[report.md](/home/node/workspace/projects/ch1/.files/report.md)"
	before, after, refs := extractFileRefSegments(in)

	if before != "处理完成。" {
		t.Fatalf("unexpected before text: %q", before)
	}
	if after != "" {
		t.Fatalf("unexpected after text: %q", after)
	}
	if len(refs) != 1 {
		t.Fatalf("expected 1 ref, got %d", len(refs))
	}
	if refs[0].Name != "report.md" || refs[0].Path != "/home/node/workspace/projects/ch1/.files/report.md" {
		t.Fatalf("unexpected ref: %+v", refs[0])
	}
}

func TestExtractFileRefSegments_WithFooter(t *testing.T) {
	in := "任务已完成。\n\n[a.png](/home/node/workspace/projects/ch1/.files/a.png) [b.txt](/home/node/workspace/projects/ch1/.files/b.txt)\n\n> [!footer] 运行统计\n> ⏱️ 1.0s  |  🪙 预估 $0.01  |  📊 IN: 1 / OUT: 1 tokens"
	before, after, refs := extractFileRefSegments(in)

	if before != "任务已完成。" {
		t.Fatalf("unexpected before text: %q", before)
	}
	expectedAfter := "> [!footer] 运行统计\n> ⏱️ 1.0s  |  🪙 预估 $0.01  |  📊 IN: 1 / OUT: 1 tokens"
	if after != expectedAfter {
		t.Fatalf("unexpected after text:\n%q\nexpected:\n%q", after, expectedAfter)
	}
	if len(refs) != 2 {
		t.Fatalf("expected 2 refs, got %d", len(refs))
	}
}

func TestExtractFileRefSegments_InMiddle(t *testing.T) {
	in := "图片已成功保存！这是您要的横屏随机图片：\n\n[随机图片文件](/.files/random-image.jpg)\n\n### 图片信息\n- 来源: demo\n\n> [!footer] 运行统计\n> ⏱️ 68.1s  |  🪙 预估 $0.67  |  📊 IN: 131.9k / OUT: 378 tokens"
	before, after, refs := extractFileRefSegments(in)
	if before != "图片已成功保存！这是您要的横屏随机图片：" {
		t.Fatalf("unexpected before text: %q", before)
	}
	expectedAfter := "### 图片信息\n- 来源: demo\n\n> [!footer] 运行统计\n> ⏱️ 68.1s  |  🪙 预估 $0.67  |  📊 IN: 131.9k / OUT: 378 tokens"
	if after != expectedAfter {
		t.Fatalf("unexpected after text:\n%q\nexpected:\n%q", after, expectedAfter)
	}
	if len(refs) != 1 {
		t.Fatalf("expected 1 ref, got %d", len(refs))
	}
}

func TestExtractFileRefSegments_NoRef(t *testing.T) {
	in := "这是普通文本。\n\n没有文件行。"
	before, after, refs := extractFileRefSegments(in)
	if before != in {
		t.Fatalf("expected unchanged text, got: %q", before)
	}
	if after != "" {
		t.Fatalf("expected empty after text, got: %q", after)
	}
	if len(refs) != 0 {
		t.Fatalf("expected no refs, got %d", len(refs))
	}
}

func TestMessageHasUsageFooter(t *testing.T) {
	withFooter := "内容\n\n> [!footer] 运行统计\n> ⏱️ 1.0s  |  🪙 预估 $0.01  |  📊 IN: 1 / OUT: 1 tokens"
	if !messageHasUsageFooter(withFooter) {
		t.Fatalf("expected footer detection true")
	}
	withLegacyFooter := "内容\n\n> ⏱️ 1.0s  |  🪙 预估 $0.01  |  📊 IN: 1 / OUT: 1 tokens"
	if !messageHasUsageFooter(withLegacyFooter) {
		t.Fatalf("expected legacy footer detection true")
	}
	withoutFooter := "普通内容"
	if messageHasUsageFooter(withoutFooter) {
		t.Fatalf("expected footer detection false")
	}
}

func TestFormatFileTransferErrorCallout(t *testing.T) {
	msg := formatFileTransferErrorCallout(
		"文件下载失败",
		"545360.jpg",
		"file:///home/node/workspace/projects/ch1/.files/545360.jpg",
		errors.New("status=404: {\"ok\": false, \"error\": \"file not found\"}"),
	)

	if !strings.Contains(msg, "> [!warning] 文件下载失败") {
		t.Fatalf("missing callout title: %q", msg)
	}
	if !strings.Contains(msg, "> 文件：`545360.jpg`") {
		t.Fatalf("missing file line: %q", msg)
	}
	if !strings.Contains(msg, "> 路径：`file:///home/node/workspace/projects/ch1/.files/545360.jpg`") {
		t.Fatalf("missing path line: %q", msg)
	}
	if !strings.Contains(msg, "> 错误：`status=404: {\"ok\": false, \"error\": \"file not found\"}`") {
		t.Fatalf("missing error line: %q", msg)
	}
}

func TestStripCrawlerSiteLines_RemovesOnlyCrawlerLines(t *testing.T) {
	in := strings.Join([]string{
		"🌐 Crawling site https://claude.com/claude-code",
		"🌐 Crawling site https://example.com/1",
		"好的!我已经为您创建了提醒。",
		"",
		"> [!footer] 运行统计",
	}, "\n")

	got := stripCrawlerSiteLines(in)
	want := strings.Join([]string{
		"好的!我已经为您创建了提醒。",
		"",
		"> [!footer] 运行统计",
	}, "\n")
	if got != want {
		t.Fatalf("stripCrawlerSiteLines mismatch\nwant:\n%q\ngot:\n%q", want, got)
	}
}

func TestStripCrawlerSiteLines_AllCrawlerLinesBecomeEmpty(t *testing.T) {
	in := "🌐 Crawling site https://a\n🌐 Crawling site https://b\n"
	got := stripCrawlerSiteLines(in)
	if got != "" {
		t.Fatalf("expected empty output, got %q", got)
	}
}
