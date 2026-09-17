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
    border: '2px solid var(--teal-400)',
    boxShadow: 'var(--shadow-sm)'
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
        background: 'linear-gradient(135deg, var(--navy-700), var(--teal-600))',
        color: 'white',
        fontWeight: 700,
        fontSize: size * 0.4
      }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  )
}