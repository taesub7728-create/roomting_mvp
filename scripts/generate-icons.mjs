// roomting-icon-white-bg.svg를 기준으로 favicon/앱 아이콘 세트를 생성한다.
// 실행: npm run icons
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const sourceSvg = path.join(root, 'src/assets/roomting-icon-white-bg.svg')
const publicDir = path.join(root, 'public')

const pngSizes = [
  { size: 16, file: 'favicon-16x16.png' },
  { size: 32, file: 'favicon-32x32.png' },
  { size: 48, file: 'favicon-48x48.png' },
  { size: 180, file: 'apple-touch-icon.png' },
  { size: 192, file: 'icon-192.png' },
  { size: 512, file: 'icon-512.png' },
]

function buildIco(pngBuffers) {
  const headerSize = 6
  const dirEntrySize = 16
  const offsets = []
  let offset = headerSize + dirEntrySize * pngBuffers.length
  for (const buf of pngBuffers) {
    offsets.push(offset)
    offset += buf.length
  }

  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(pngBuffers.length, 4)

  const dirEntries = pngBuffers.map((buf, i) => {
    const entry = Buffer.alloc(dirEntrySize)
    const size = i === 0 ? 16 : i === 1 ? 32 : 48
    entry.writeUInt8(size === 256 ? 0 : size, 0) // width
    entry.writeUInt8(size === 256 ? 0 : size, 1) // height
    entry.writeUInt8(0, 2) // color palette
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // color planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(buf.length, 8) // image data size
    entry.writeUInt32LE(offsets[i], 12) // offset
    return entry
  })

  return Buffer.concat([header, ...dirEntries, ...pngBuffers])
}

async function main() {
  await mkdir(publicDir, { recursive: true })

  const pngBuffers = {}
  for (const { size, file } of pngSizes) {
    const buf = await sharp(sourceSvg).resize(size, size).png().toBuffer()
    await writeFile(path.join(publicDir, file), buf)
    pngBuffers[size] = buf
    console.log(`generated public/${file}`)
  }

  const ico = buildIco([pngBuffers[16], pngBuffers[32], pngBuffers[48]])
  await writeFile(path.join(publicDir, 'favicon.ico'), ico)
  console.log('generated public/favicon.ico')

  await copyFile(sourceSvg, path.join(publicDir, 'favicon.svg'))
  console.log('copied public/favicon.svg')
}

main()
