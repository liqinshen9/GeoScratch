import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

export default function RunButton({ autoRender, onRun }) {
  return (
    <FontAwesomeIcon
      icon="fa-solid fa-play"
      className={`text-2xl transition-opacity ${autoRender ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:text-sky-700'}`}
      onClick={() => !autoRender && onRun?.()}
      title={autoRender ? 'Disable Auto Render to run manually' : 'Run'}
    />
  )
}
