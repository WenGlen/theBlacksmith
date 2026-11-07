import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * GitHub Pages 把站台掛在 https://<user>.github.io/<repo>/ 底下，
 * 所以正式建置的資源路徑必須帶 repo 名當前綴，否則全部 404、畫面全黑。
 * 開發時是掛在根目錄，加了前綴反而要多打一段路徑，所以只在
 * build 與 preview 兩種情境套用——preview 吃的是 build 出來的檔案，
 * 不跟著套就會對不上 index.html 裡已經寫死的路徑。
 */
const PAGES_BASE = '/theBlacksmith/';

export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  server: { port: 5180 },
}));
