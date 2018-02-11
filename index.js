const html = require('choo/html')
const devtools = require('choo-devtools')
const choo = require('choo')
const hypermergeMicro = require('./hypermerge-micro')
const websocket = require('websocket-stream')
const pump = require('pump')

function mainView (state, emit) {
  const {selectedColor, doc, pixelDoc} = state

  if (!doc) return html`Loading...`

  const colors = ['r', 'g', 'b', 'w']
  const colorEles = colors.map(color => {
    const selected = color === selectedColor ? "selected" : null

    return html`
      <div
        class="color ${selected}"
        data-color="${color}"
        onclick="${onclick}">
      </div>
    `

    function onclick () {
      emit('pickColor', color)
    }
  })

  const pixelEles = []
  for (let y = 0; y <= 1; y++) {
    for (let x = 0; x <= 1; x++) {
      const color = doc[`x${x}y${y}`]
      const pixelEle = html`
        <div
          class="pixel"
          id="x${x}y${y}"
          data-color="${color}"
          onclick="${onclick}">
        </div>
      `
      pixelEles.push(pixelEle)

      function onclick () {
        emit('setPixelColor', x, y, selectedColor)
      }
    }
  }
  
  function submit (e) {
    const key = e.target.children[0].value
    emit('addActor', key)    
    console.log('jim add actor', key)
    e.preventDefault()
  }

  return html`
    <body>
      <div class="info">
        Source: ${pixelDoc.hm.source.key.toString('hex')}<br>
        Archiver: ${pixelDoc.hm.getArchiverKey().toString('hex')}<br>
        <form onsubmit=${submit}>
          <input type="text">
        </form>
      </div>
      <div class="container">
        <div class="palette">
          ${colorEles}
        </div>
        <div class="pixels">
          ${pixelEles}
        </div>
      </div>
    </body>
  `
}

class PixelDoc {
  constructor (update) {
    this.update = update
    const hm = hypermergeMicro({debugLog: true})
    hm.on('debugLog', console.log)
    hm.on('ready', this.ready.bind(this))
    this.hm = hm
  }

  ready () {
    const hm = this.hm
    hm.doc.registerHandler(doc => {
      this.update(doc)
    })

    if (hm.source.length === 0) {
      hm.change('blank canvas', doc => {
        doc.x0y0 = 'w'
        doc.x0y1 = 'w'
        doc.x1y0 = 'w'
        doc.x1y1 = 'w'
      })
    }

    console.log('Ready', hm.get())

    hm.multicore.on('announceActor', message => {
      console.log('announceActor', message)
      hm.connectPeer(message.key)
    })

    const archiverKey = hm.getArchiverKey().toString('hex')
    const hostname = document.location.hostname
    const url = `wss://${hostname}/archiver/${archiverKey}`
    const stream = websocket(url)
    // this.ws = websocket(url)
    // this.ws.write('Jim test')
    pump(
      stream,
      // hm.multicore.archiver.replicate({live: true, encrypt: false}),
      // hm.multicore.archiver.replicate({key: hm.multicore.archiver.changes.key}),
      // hm.multicore.archiver.replicate({key: hm.key}),
      // hm.multicore.archiver.replicate({live: true}),
      hm.multicore.archiver.replicate({encrypt: false}),
      stream
    )
  }

  setPixelColor (x, y, color) {
    this.hm.change(doc => { doc[`x${x}y${y}`] = color })
    // this.ws.write(`setPixelColor ${x} ${y} ${color}`)
  }
  
  addActor (key) {
    this.hm.connectPeer(key)
  }
}

function pixelStore (state, emitter) {
  state.pixelDoc = new PixelDoc(doc => {
    state.doc = doc
    emitter.emit('render')
  })
  state.selectedColor = 'r'

  emitter.on('pickColor', color => {
    state.selectedColor = color
    emitter.emit('render')
  })
  emitter.on('setPixelColor', (x, y, color) => {
    state.pixelDoc.setPixelColor(x, y, color)
  })
  emitter.on('addActor', key => {
    state.pixelDoc.addActor(key)
  })
}

const app = choo()
app.use(devtools())
app.use(pixelStore)
app.route('/', mainView)
app.mount('body')
