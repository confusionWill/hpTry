import process from 'node:process'

import { createServer, preview } from 'vite'

const mode = process.argv[2]

if (mode !== 'dev' && mode !== 'preview') {
  throw new Error('Usage: node scripts/serve.mjs <dev|preview>')
}

const configFiles = ['vite.config.ts', 'vite.preview.config.ts']
const servers = await Promise.all(
  configFiles.map((configFile) =>
    mode === 'dev' ? createServer({ configFile }) : preview({ configFile }),
  ),
)

if (mode === 'dev') {
  await Promise.all(servers.map((server) => server.listen()))
}

servers.forEach((server) => server.printUrls())

let closing = false

async function closeServers() {
  if (closing) {
    return
  }

  closing = true
  await Promise.all(servers.map((server) => server.close()))
}

process.once('SIGINT', () => {
  void closeServers().then(() => process.exit(0))
})
process.once('SIGTERM', () => {
  void closeServers().then(() => process.exit(0))
})
