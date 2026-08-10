import { execFileSync } from 'node:child_process'
import { openSync, readSync, closeSync } from 'node:fs'

/**
 * tracked 파일에 UTF-8 BOM(EF BB BF)이 들어갔는지 검사한다.
 *
 * 왜 필요한가:
 * 666b860 에서 package.json 앞에 BOM 이 붙어 Vercel 프로덕션 배포가 5회 연속 실패했다.
 * postcss-load-config 는 postcss.config.* 가 없으면 fallback 으로 package.json 을
 * JSON.parse 하는데, JSON.parse 는 BOM 을 벗기지 않아 SyntaxError 가 난다.
 * npm 은 BOM 을 벗기므로 install 은 통과하고 build 만 죽는다 - 그래서 알아채기 어렵다.
 *
 * 원인은 Windows PowerShell 5.1 의 Out-File / > / Set-Content 가 UTF-8 "with BOM" 으로
 * 저장하는 기본 동작이다. 같은 환경에서 계속 작업하는 한 재발한다.
 */

/**
 * BOM 이 의도적으로 들어가는 파일.
 *
 * merge_report.csv 는 사람이 Excel 로 여는 검수 리포트다.
 * lib/csv.mjs:124-125 에 적힌 그대로 - "BOM이 없으면 Windows Excel이 CP949로 읽어
 * 한글 역명이 전부 깨진다". 그래서 writeCsv() 가 매번 BOM 을 붙여 쓴다.
 * 여기서 제외하지 않으면 정당한 파일 때문에 모든 빌드가 깨진다.
 *
 * ★ 이 목록은 늘리지 않는 것이 기본이다. 새 항목을 넣으려면 "왜 이 파일만 예외인가"를
 *   여기 주석으로 남긴다. 이유 없는 예외는 나중에 아무도 판단할 수 없다.
 */
const ALLOWLIST = new Set(['scripts/seed-stations/merge_report.csv'])

const BOM = [0xef, 0xbb, 0xbf]

function listTrackedFiles() {
  // -z: 경로에 공백/한글이 있어도 안전하게 NUL 로 끊는다.
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8' })
  return out.split('\0').filter(Boolean)
}

/** 파일 앞 3바이트만 읽는다. selftest.mjs(80KB) 같은 파일을 통째로 읽을 이유가 없다. */
function startsWithBom(filePath) {
  let fd
  try {
    fd = openSync(filePath, 'r')
  } catch {
    // 인덱스에는 있지만 작업 트리에 없는 경우(삭제 후 미커밋 등). 검사 대상이 아니다.
    return false
  }
  try {
    const head = Buffer.alloc(3)
    const read = readSync(fd, head, 0, 3, 0)
    return read === 3 && BOM.every((byte, i) => head[i] === byte)
  } finally {
    closeSync(fd)
  }
}

let files
try {
  files = listTrackedFiles()
} catch {
  // git 이 없거나 .git 이 없는 환경(일부 CI 의 tarball 배포 등)에서는 검사를 건너뛴다.
  // 이 검사는 커밋 전에 로컬에서 막는 것이 목적이고, 여기서 빌드를 세우면
  // 정작 막으려던 것(배포 실패)을 우리가 직접 만드는 꼴이 된다.
  console.warn('check-bom: git tracked 파일 목록을 읽을 수 없어 BOM 검사를 건너뜁니다.')
  process.exit(0)
}

const offenders = files.filter((file) => !ALLOWLIST.has(file) && startsWithBom(file))

if (offenders.length > 0) {
  console.error(
    [
      '',
      `✗ UTF-8 BOM 이 있는 파일 ${offenders.length}개를 찾았습니다. 빌드를 중단합니다.`,
      '',
      ...offenders.map((file) => `  - ${file}`),
      '',
      '원인:',
      '  Windows PowerShell 5.1 의 Out-File / > / Set-Content 는 UTF-8 "with BOM" 으로 저장합니다.',
      '  이 파일들이 그렇게 저장됐을 가능성이 높습니다.',
      '',
      '해결:',
      '  에디터에서 BOM 없는 UTF-8(VS Code 하단 인코딩 → "Save with Encoding" → UTF-8)로',
      '  다시 저장하십시오. PowerShell 로 고칠 때는 리다이렉션을 쓰지 말고',
      '  [System.IO.File]::WriteAllBytes() 로 앞 3바이트(EF BB BF)만 잘라내십시오.',
      '',
      '  BOM 이 의도적으로 필요한 파일이라면 scripts/check-bom.mjs 의 ALLOWLIST 에',
      '  이유와 함께 추가하십시오.',
      '',
    ].join('\n'),
  )
  process.exit(1)
}

console.log(`check-bom: tracked 파일 ${files.length}개 검사 완료. BOM 없음.`)
