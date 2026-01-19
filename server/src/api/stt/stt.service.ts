export async function transcribeVoiceFileToText(_file: Express.Multer.File): Promise<string> {
  // NOTE: We don't have an STT provider key yet.
  // Hard-coded placeholder per product requirement.
  return '语音转文字结果为空';
}

