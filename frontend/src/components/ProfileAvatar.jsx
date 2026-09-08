export default function ProfileAvatar({
  src,
  name = '',
  size = 44
}) {
  const style = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    objectFit: 'cover',
    border: '2px solid #dbeafe'
  }

  if (src) {
    return (
      <img
        src={src}
        alt={`${name || 'Your'} profile picture`}
        style={style}
      />
    )
  }

  return (
    <div
      aria-label={`${name || 'Your'} profile picture placeholder`}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#2563eb',
        color: 'white',
        fontWeight: 700,
        fontSize: size * 0.4
      }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  )
}