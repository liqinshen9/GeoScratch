import React from 'react'
import useWorkspaceStore from '@/store/useWorkspaceStore'

const Title = () => {
  const { title } = useWorkspaceStore()

  return (
    <h1 className="font-bold text-3xl">
      {title}
    </h1>
  )
}

export default Title