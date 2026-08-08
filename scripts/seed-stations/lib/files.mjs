import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { dataDir } from '../config.mjs'

/**
 * data/ 안에서 패턴에 맞는 파일 하나를 찾는다.
 * 0개거나 2개 이상이면 중단한다 - 갱신본을 받아 두 개가 같이 들어 있을 때
 * 조용히 옛 파일을 읽는 것이 가장 나쁜 결과이기 때문이다.
 */
export async function findSourceFile(spec, label) {
  let entries
  try {
    entries = await readdir(dataDir)
  } catch {
    throw new Error(
      [
        `원본 데이터 폴더가 없습니다: ${dataDir}`,
        '',
        '아래 파일을 내려받아 그 폴더에 넣으십시오(가공하지 않고 그대로).',
        '  - 전국도시철도역사정보표준데이터  https://www.data.go.kr/data/15013205/standard.do',
        '  - 서울교통공사_역명 다국어 표기    https://www.data.go.kr/data/15044232/fileData.do',
      ].join('\n'),
    )
  }

  const matches = entries.filter((name) => spec.match.test(name))

  if (matches.length === 0) {
    throw new Error(
      [
        `${label} 파일을 찾지 못했습니다.`,
        `  찾은 위치: ${dataDir}`,
        `  찾는 패턴: ${spec.match}`,
        `  출처: ${spec.hint}`,
        '',
        `현재 폴더 안의 파일: ${entries.length > 0 ? entries.join(', ') : '(없음)'}`,
        '',
        '파일명이 달라졌다면 config.mjs 의 sourceFiles 패턴을 고치십시오.',
      ].join('\n'),
    )
  }

  if (matches.length > 1) {
    throw new Error(
      [
        `${label} 후보가 ${matches.length}개입니다. 어느 것을 읽어야 할지 확정할 수 없어 중단합니다.`,
        ...matches.map((m) => `  - ${m}`),
        '',
        '옛 파일을 지우거나 다른 폴더로 옮긴 뒤 다시 실행하십시오.',
      ].join('\n'),
    )
  }

  return path.join(dataDir, matches[0])
}
