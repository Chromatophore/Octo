/**
* Options
**/

const compatProfile  = radioBar(document.getElementById('compatibility-profile'), 'octo', setCompatibilityProfile)
const screenRotation = radioBar(document.getElementById('screen-rotation'), 0, x => emulator.screenRotation = +x)

const compatibilityProfiles = {
  chip8: { shiftQuirks:0, loadStoreQuirks:0, vfOrderQuirks:0, clipQuirks:1, jumpQuirks:0, vBlankQuirks:1, maxSize:3215  },
  schip: { shiftQuirks:1, loadStoreQuirks:1, vfOrderQuirks:0, clipQuirks:1, jumpQuirks:1, vBlankQuirks:0, maxSize:3583  },
  octo:  { shiftQuirks:0, loadStoreQuirks:0, vfOrderQuirks:0, clipQuirks:0, jumpQuirks:0, vBlankQuirks:0, maxSize:3584  },
  xo:    { shiftQuirks:0, loadStoreQuirks:0, vfOrderQuirks:0, clipQuirks:0, jumpQuirks:0, vBlankQuirks:0, maxSize:65024 },
}
const compatibilityFlags = {
  shiftQuirks:     checkBox(document.getElementById('compat-shift' ), false, setOptions),
  loadStoreQuirks: checkBox(document.getElementById('compat-load'  ), false, setOptions),
  vfOrderQuirks:   checkBox(document.getElementById('compat-vf'    ), false, setOptions),
  clipQuirks:      checkBox(document.getElementById('compat-clip'  ), false, setOptions),
  jumpQuirks:      checkBox(document.getElementById('compat-jump0' ), false, setOptions),
  vBlankQuirks:    checkBox(document.getElementById('compat-vblank'), false, setOptions),
  maxSize:         radioBar(document.getElementById('max-size'), 3584, setOptions),
}

function setCompatibilityProfile(x) {
  const p = compatibilityProfiles[x]
  for (key in compatibilityFlags) emulator[key] = p[key]
  saveLocalOptions()
  updateOptions()
}
function setOptions() {
  for (key in compatibilityFlags) emulator[key] = compatibilityFlags[key].getValue()
  saveLocalOptions()
  updateOptions()
}
function updateOptions() {
  for (key in compatibilityFlags) compatibilityFlags[key].setValue(emulator[key])
  screenRotation.setValue(emulator.screenRotation)
  compatProfile.setValue('none')
  for (key in compatibilityProfiles) {
    const p = compatibilityProfiles[key]
    const same = Object.keys(p).every(x => emulator[x] == p[x])
    if (same) compatProfile.setValue(key)
  }
}

/**
* Keyboard Config
**/

const keyConfigModal = document.getElementById('key-config-modal')
const keyConfigStandalone = checkBox(document.getElementById('key-config-standalone' ), false, x => x)

document.getElementById('key-config-show').onclick = _ => {
  keyConfigModal.querySelectorAll('table .button').forEach(x => {
    const k = x.dataset.key
    const i = keyConfigModal.querySelector(`table input[data-key="${k}"]`)
    i.value = Object.keys(keymap[parseInt(k,16)]).join(',')
    x.onclick = _ => {
      i.onkeydown = event => {
        event.stopPropagation()
        event.preventDefault()
        i.onkeydown = null
        keyConfigModal.querySelectorAll('table input').forEach(x => {
          x.value = except(x.value.split(','), event.key).join(',')
        })
        i.value = distinct(i.value.split(',').concat(event.key)).join(',')
      }
      i.focus()
    }
  })
  setVisible(keyConfigModal, true)
  keyConfigStandalone.setValue(keymap.staticExport == true)
}

document.getElementById('key-config-done').onclick = _ => {
  keyConfigModal.querySelectorAll('table input').forEach(x => {
    const k = parseInt(x.dataset.key, 16)
    keymap[k] = toset(x.value.split(','))
  })
  keymap.staticExport = keyConfigStandalone.getValue()
  keymapInverse = invertKeymap(keymap)
  localStorage.setItem('octoKeymap', JSON.stringify(keymap))
  setVisible(keyConfigModal, false)
}

