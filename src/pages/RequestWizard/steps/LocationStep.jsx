import StationAutocomplete from './StationAutocomplete'

// 지역/역 선택 단계. 입력 UI 자체는 StationAutocomplete 가 담당한다.
export default function LocationStep({ t, form, update }) {
  return <StationAutocomplete t={t} form={form} update={update} />
}
