export const IpcChannels = {
  // Settings
  hasApiKey: 'settings:hasApiKey',
  saveApiKey: 'settings:saveApiKey',
  getUsage: 'settings:getUsage',
  getLastTargetLang: 'settings:getLastTargetLang',
  setLastTargetLang: 'settings:setLastTargetLang',
  getFormality: 'settings:getFormality',
  setFormality: 'settings:setFormality',

  // Translation
  pickFile: 'translate:pickFile',
  translate: 'translate:run',
  cancelTranslation: 'translate:cancel',
  progress: 'translate:progress',

  // OS integration
  revealInFolder: 'os:revealInFolder',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
