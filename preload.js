const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('app:minimize'),
  maximize: () => ipcRenderer.send('app:maximize'),
  close: () => ipcRenderer.send('app:close'),

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value })
  },

  ado: {
    request: (method, url, pat, body, contentType) =>
      ipcRenderer.invoke('ado:request', { method, url, pat, body, contentType })
  },

  ai: {
    complete: (options) => ipcRenderer.invoke('ai:complete', options)
  },

  fs: {
    write: (filePath, content) =>
      ipcRenderer.invoke('fs:write', { filePath, content }),
    saveDialog: (filename, content) =>
      ipcRenderer.invoke('fs:saveDialog', { filename, content }),
    openDialog: (filters) =>
      ipcRenderer.invoke('fs:openDialog', { filters })
  },

  shell: {
    openExternal: (url)      => ipcRenderer.invoke('shell:openExternal', url),
    openPath:     (filePath) => ipcRenderer.invoke('shell:openPath', filePath),
  },

  mail: {
    auth:             (opts)           => ipcRenderer.invoke('mail:auth', opts),
    getStatus:        ()               => ipcRenderer.invoke('mail:getStatus'),
    disconnect:       ()               => ipcRenderer.invoke('mail:disconnect'),
    getMessages:      (opts)           => ipcRenderer.invoke('mail:getMessages', opts),
    markRead:         (emailId)        => ipcRenderer.invoke('mail:markRead', { emailId }),
    getUnreadCount:   ()               => ipcRenderer.invoke('mail:getUnreadCount'),
    getConversation:  (conversationId) => ipcRenderer.invoke('mail:getConversation', { conversationId }),
    getAttachments:   (messageId)      => ipcRenderer.invoke('mail:getAttachments', { messageId }),
    saveAttachment:   (opts)           => ipcRenderer.invoke('mail:saveAttachment', opts),
    deviceCodeInit:   ()               => ipcRenderer.invoke('mail:devicecode-init'),
    deviceCodePoll:   (deviceCode)     => ipcRenderer.invoke('mail:devicecode-poll', { deviceCode }),
    setInputEmail:    (subject, body)  => ipcRenderer.invoke('mail:setInputEmail', { subject, body }),
  }
});
