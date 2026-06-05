import useWorkspaceStore from '@/store/useWorkspaceStore'
import GeoScratchLogo from '@/components/Brand/GeoScratchLogo.jsx'

const Title = () => {
  const { title } = useWorkspaceStore()

  return (
    <GeoScratchLogo
      className="app-nav__logo"
      wordmark={title}
      showMark={false}
      showWordmark
    />
  )
}

export default Title
