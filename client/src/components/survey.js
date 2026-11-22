// A Western Canada well id is a survey address: location exception, legal subdivision, section,
// township, range and meridian. That is enough to place the well on a map with no coordinates.
const surveyUwi = /^(\w{3})(\d{2})(\d{2})(\d{3})(\d{2})W(\d)(\d{2})$/
const milesPerDegree = 69.05

// Sections and subdivisions are numbered in rows that snake west then east from the south-east corner.
function snake(number, width) {
  const row = Math.floor((number - 1) / width)
  const step = (number - 1) % width
  return { row, fromEast: row % 2 === 0 ? step : width - 1 - step }
}

// Range lines are laid out again at every fourth township, which is why prairie roads jog at the correction lines.
// Miles north of the 49th parallel of the base line a township is measured from.
export function baseLine(township) {
  return Math.floor((township + 1) / 4) * 24
}

// Miles between the 4th meridian (110°W, the Alberta-Saskatchewan border) and another meridian at this distance north.
export function meridianOffset(meridian, north) {
  const latitude = 49 + north / milesPerDegree
  return (4 - meridian) * 4 * 69.17 * Math.cos(latitude * Math.PI / 180)
}

// Miles east of the 4th meridian and north of the 49th parallel, or null when the id is not a survey address.
export function locate(id) {
  const part = surveyUwi.exec(id)
  if (!part) return null
  const [subdivision, section, township, range, meridian] = part.slice(2, 7).map(Number)
  if (!township || !range || section < 1 || section > 36 || subdivision > 16 || meridian < 1 || meridian > 6) return null
  const inTownship = snake(section, 6)
  // A well filed against the whole section sits at its centre.
  const inSection = subdivision ? snake(subdivision, 4) : { row: 1.5, fromEast: 1.5 }
  const y = (township - 1) * 6 + inTownship.row + (inSection.row + 0.5) / 4
  const west = (range - 1) * 6 + inTownship.fromEast + (inSection.fromEast + 0.5) / 4
  return { x: meridianOffset(meridian, baseLine(township)) - west, y }
}
