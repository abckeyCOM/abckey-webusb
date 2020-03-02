import { EventEmitter } from 'events'
import Logs from './Logs'

export default class Webusb extends EventEmitter {
  productId?: number
  serialNumber?: string
  debug?: boolean
  selectConfiguration: number
  claimInterface: number
  private __DEVICE__?: USBDevice

  constructor() {
    super()
    this.selectConfiguration = 1
    this.claimInterface = 0

    Logs.listen(log => { if (this.debug) console.log(log.id, log.time, log.title, log.data) })
    navigator.usb.addEventListener('disconnect', e => {
      this.__DEVICE__ = undefined
      this.productId = undefined
      this.serialNumber = undefined
      Logs.add(e)
      this.emit('disconnect', e)
    })
  }

  async requestDevice(filters: Array<USBDeviceFilter>) {
    try {
      const device = await navigator.usb.requestDevice({ filters })
      const result = await this.openDevice(device)
      if (!result) return
      Logs.add(device)
      return device
    } catch (err) {
      Logs.add(err.message)
      return
    }
  }

  onConnect(cb: (e: USBConnectionEvent) => void) {
    navigator.usb.addEventListener('connect', e => {
      Logs.add(e)
      this.openDevice(e.device)
      cb(e)
    })
  }

  onDisconnect(cb: (e: USBConnectionEvent) => void) {
    this.on('disconnect', e => cb(e))
  }

  async getDevices() {
    try {
      const devices = await navigator.usb.getDevices()
      Logs.add(devices)
      return devices
    } catch (err) {
      Logs.add(err.message)
      return
    }
  }

  async transferOut(endpointNumber: number, data: ArrayBuffer) {
    if (!this.__DEVICE__) return Logs.add('[error] transferOut', Buffer.from(data).toString('hex'))
    const result = await this.__DEVICE__.transferOut(endpointNumber, data)
    if (result.status !== 'ok') return Logs.add('USBTransferStatus', result.status)
    Logs.add('transferOut', Buffer.from(data).toString('hex'))
  }

  async transferIn(endpointNumber: number, length: number) {
    if (!this.__DEVICE__) return Buffer.alloc(0)
    const result = await this.__DEVICE__.transferIn(endpointNumber, length)
    if (!result.data) return Buffer.alloc(0)
    if (result.status === 'stall') await this.__DEVICE__.clearHalt('in', 1)
    const inBuf = Buffer.from(result.data.buffer)
    Logs.add('transferIn ', inBuf.toString('hex'))
    return inBuf
  }

  private async openDevice(device: USBDevice) {
    await device.open()
    if (!device.opened) return false
    await device.selectConfiguration(this.selectConfiguration)
    await device.claimInterface(this.claimInterface)
    this.__DEVICE__ = device
    this.productId = device.productId
    this.serialNumber = device.serialNumber
    return true
  }
}
