// property_images(정렬 순서 포함) 배열을 sort_order 순 URL 배열로 변환
export function sortedImageUrls(property) {
  if (!property?.property_images?.length) return []
  return [...property.property_images].sort((a, b) => a.sort_order - b.sort_order).map((img) => img.image_url)
}
