import { Icon } from '../../components/ui/icon/Icon'

type ReviewStarsProps = {
  rating: number
  size?: number
}

export function ReviewStars({ rating, size = 13 }: ReviewStarsProps) {
  return Array.from({ length: 5 }, (_, index) => (
    <span
      className={`review-star ${index < rating ? 'is-filled' : ''}`}
      key={index}
      aria-hidden="true"
    >
      <Icon name="star" size={size} />
    </span>
  ))
}
