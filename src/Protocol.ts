
// Needs to be removed.

import Protobuf from './Protobuf'
import Logs from './Logs'

interface Options {
  enumname: string,
  prefix: string
  headString?: string,
  flagString?: string
}

export default class Protocol {
  __MSG_HEAD_STRING__ = "$"
  __MSG_FLAG_STRING__ = "##"
  __MSG_BYTE__ = 64
  __MSG_FLAG_BYTE__ = 2
  __MSG_TYPE_BYTE__ = 2
  __MSG_SIZE_BYTE__ = 4
  __MSG_FLAG_START__ = 1
  __MSG_TYPE_START__ = 3
  __MSG_SIZE_START__ = 5
  __MSG_DATA_START__ = 9
  __PROTOBUF__: Protobuf
  __TYPES__: any
  __OPTIONS__: Options = {
    enumname: 'Types',
    prefix: '',
    headString: '$',
    flagString: '##'
  }
  constructor(json: JsonFile, options?: Options) {
    if (options && options.enumname) this.__OPTIONS__.enumname = options.enumname
    if (options && options.prefix) this.__OPTIONS__.prefix = options.prefix
    if (options && options.headString) this.__MSG_HEAD_STRING__ = options.headString
    if (options && options.flagString) this.__MSG_FLAG_STRING__ = options.flagString
    this.__MSG_FLAG_BYTE__ = this.__MSG_FLAG_STRING__.length
    this.__MSG_FLAG_START__ = this.__MSG_HEAD_STRING__.length
    this.__MSG_TYPE_START__ = this.__MSG_FLAG_START__ + this.__MSG_FLAG_BYTE__
    this.__MSG_SIZE_START__ = this.__MSG_TYPE_START__ + this.__MSG_TYPE_BYTE__
    this.__MSG_DATA_START__ = this.__MSG_SIZE_START__ + this.__MSG_SIZE_BYTE__
    this.__PROTOBUF__ = new Protobuf(json)
  }

  async encode(type: string, data: any) {
    const arrBuf: Array<Buffer> = []
    data = data || ''
    const typeInt = await this.__PROTOBUF__.lookupEnum(this.__OPTIONS__.enumname, this.__OPTIONS__.prefix + type) // For trezor compatibility.
    if (typeof typeInt !== 'number') return arrBuf
    let dataBuf = await this.__PROTOBUF__.encode(type, data)
    dataBuf = Buffer.from(dataBuf)
    const flagBuf = Buffer.from(this.__MSG_FLAG_STRING__)
    const typeBuf = Buffer.alloc(this.__MSG_TYPE_BYTE__)
    const sizeBuf = Buffer.alloc(this.__MSG_SIZE_BYTE__)
    typeBuf.writeUInt16BE(typeInt, 0)
    sizeBuf.writeUInt32BE(dataBuf.length, 0)
    const bodyBuf = Buffer.concat([
      flagBuf,
      typeBuf,
      sizeBuf,
      dataBuf
    ],
      this.__MSG_FLAG_BYTE__ +
      this.__MSG_TYPE_BYTE__ +
      this.__MSG_SIZE_BYTE__ +
      dataBuf.length
    )
    const headBuf = Buffer.from(this.__MSG_HEAD_STRING__)
    const pageNum = Math.ceil(bodyBuf.length / (this.__MSG_BYTE__ - 1))
    for (let i = 0; i < pageNum; i++) {
      const tmpBuf = bodyBuf.slice(i * (this.__MSG_BYTE__ - 1), (i + 1) * (this.__MSG_BYTE__ - 1))
      const msgBuf = Buffer.concat([headBuf, tmpBuf], this.__MSG_BYTE__)
      arrBuf.push(msgBuf)
    }
    Logs.add('JSON', { type, data })
    Logs.add('TYPE', typeBuf.toString('hex'))
    Logs.add('DATA', dataBuf.length ? Buffer.from(dataBuf).toString('hex') : 0)
    for (let item of arrBuf) Logs.add('PROTO', Buffer.from(item).toString('hex'))
    return arrBuf
  }

  async decode(arrBuf: Array<Buffer>) {
    let typeBuf = Buffer.alloc(this.__MSG_TYPE_BYTE__)
    let sizeBuf = Buffer.alloc(this.__MSG_SIZE_BYTE__)
    let dataBuf = Buffer.alloc(0)
    let typeInt = -1
    let sizeInt = -1
    let typeStr = ''
    for (let i = 0; i < arrBuf.length; i++) {
      if (!this.hasHead(arrBuf[i])) return
      if (this.hasFlag(arrBuf[i])) {
        typeBuf = arrBuf[i].slice(this.__MSG_TYPE_START__, this.__MSG_SIZE_START__)
        sizeBuf = arrBuf[i].slice(this.__MSG_SIZE_START__, this.__MSG_DATA_START__)
        sizeInt = sizeBuf.readIntBE(0, this.__MSG_SIZE_BYTE__)
        typeInt = typeBuf.readIntBE(0, this.__MSG_TYPE_BYTE__)
        typeStr = await this.__PROTOBUF__.lookupEnum(this.__OPTIONS__.enumname, typeInt)
        dataBuf = arrBuf[i].slice(this.__MSG_DATA_START__) // First packet
      } else {
        const tempBuf = arrBuf[i].slice(this.__MSG_FLAG_START__)
        dataBuf = Buffer.concat([dataBuf, tempBuf], dataBuf.length + tempBuf.length) // Following packets
      }
    }
    if (sizeInt === -1) return
    if (dataBuf.length < sizeInt) return
    dataBuf = dataBuf.slice(0, sizeInt)
    typeStr = typeStr.replace(this.__OPTIONS__.prefix, '') // For trezor compatibility.
    const msg = await this.__PROTOBUF__.decode(typeStr, dataBuf)
    for (let item of arrBuf) Logs.add('PROTO', Buffer.from(item).toString('hex'))
    Logs.add('TYPE', typeBuf.toString('hex'))
    Logs.add('DATA', dataBuf.length ? Buffer.from(dataBuf).toString('hex') : 0)
    Logs.add('JSON', msg)
    return msg
  }

  msgSize(buffer: Buffer) {
    return buffer.slice(this.__MSG_SIZE_START__, this.__MSG_DATA_START__)
      .readIntBE(0, this.__MSG_SIZE_BYTE__)
      + this.__MSG_FLAG_BYTE__
      + this.__MSG_TYPE_BYTE__
      + this.__MSG_SIZE_BYTE__
  }

  msgPages(buffer: Buffer) {
    return Math.ceil(this.msgSize(buffer) / (this.__MSG_BYTE__ - this.__MSG_HEAD_STRING__.length))
  }

  hasHead(buffer: Buffer) {
    return buffer.slice(0, this.__MSG_FLAG_START__).toString() === this.__MSG_HEAD_STRING__ ? true : false
  }

  hasFlag(buffer: Buffer) {
    return buffer.slice(this.__MSG_FLAG_START__, this.__MSG_TYPE_START__).toString() === this.__MSG_FLAG_STRING__ ? true : false
  }
}
