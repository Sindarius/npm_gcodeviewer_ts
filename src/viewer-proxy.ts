import ViewerWorker from './viewer.worker?worker&inline'

const mouseEventFields = [
        'altKey',
		'bubbles',
		'button',
		'buttons',
		'cancelBubble',
		'cancelable',
		'clientX',
		'clientY',
		'composed',
		'ctrlKey',
		'defaultPrevented',
		'detail',
		'eventPhase',
		'fromElement',
		'isTrusted',
		'layerX',
		'layerY',
		'metaKey',
		'movementX',
		'movementY',
		'offsetX',
		'offsetY',
		'pageX',
		'pageY',
		'returnValue',
		'screenX',
		'screenY',
		'shiftKey',
		'timeStamp',
		'type',
		'which',
		'x',
		'y',
		'deltaX',
		'deltaY',
		'deltaZ',
        'deltaMode']
        
const keyboardEventFields = [
    'isTrusted',
    'altKey',
    'bubbles',
    'cancelBubble',
    'cancelable',
    'charCode',
    'code',
    'composed',
    'ctrlKey',
    'defaultPrevented',
    'detail',
    'eventPhase',
    'isComposing',
    'key',
    'keyCode',
    'location',
    'metaKey',
    'repeat',
    'returnValue',
    'shiftKey',
    'type',
    'which']

export default class ViewerProxy {

    private webWorker: Worker
    mainCanvas: HTMLCanvasElement | null = null
        
    
    constructor(canvas: HTMLCanvasElement) {
        this.mainCanvas = canvas;
        this.webWorker = new ViewerWorker()
        this.webWorker.onmessage = (e) => { this.onmessage(e) };
        this.webWorker.onerror = (e) => { this.onerror(e) };

        let offscreen = this.mainCanvas?.transferControlToOffscreen();
        this.webWorker.postMessage({ type: 'init', width: this.mainCanvas.clientWidth, height: this.mainCanvas.clientHeight, offscreencanvas: offscreen }, [offscreen])
        
        //Handle window resize events without user having to implement
        window.onresize = () => { 
            this.webWorker.postMessage({ type: 'resize', width: this.mainCanvas?.clientWidth, height: this.mainCanvas?.clientHeight })
        }
    }

    //Messages from the worker
    private onmessage(e: any) {
        if (!e.data.type) return; //discard
        switch (e.data.type)
        {
            case 'event': { //event registration
                let target;
                switch (e.data.targetName) {
                    case 'window':
                        target = window;
                        break;
                    case 'canvas':
                        target = this.mainCanvas;
                        break;
                    case 'document':
                        target = document;
                        break;
                }
                
                if (!target) {
                    console.error('Unknown target: ' + e.data.targetName);
                    return;
                }
                let that = this;

                //console.log('Registering event ' + e.data.eventName + ' on ' + e.data.targetName)

                target.addEventListener(e.data.eventName, (evt) => {
                    // We can`t pass original event to the worker
                    let eventClone = {}
                    try {
                        eventClone = that.cloneEvent(evt);
                    }
                    catch (e) {
                        console.log('Error cloning event', e)
                    }
                    
                    that.webWorker.postMessage({
                        type: 'event',
                        targetName: e.data.targetName,
                        eventName: e.data.eventName,
                        eventClone: eventClone,
                    });
                }, e.data.opt);

            } break;
            case 'canvasMethod': //Calls from the canvas to preform functions such as focus
                if (this.mainCanvas) {
                    this.mainCanvas[e.data.method](...e.data.args);
                }
            break;
        }
    }

    private onerror(e: any) {
            console.log('Error received from worker')
            console.log(e) 
    }

    init(): void {
      
    }


    cancel(): void{ 
        this.webWorker.postMessage({type: 'cancel', params: []})
    }

    loadFile(fileName): void {
        this.webWorker.postMessage({ type: 'loadFile', fileName: fileName })
    }

    //Used to clone the event properties out of an object so they can be sent to worker
    cloneEvent(event) {
        var cloneFieldList = event.constructor.name === 'KeyboardEvent' ? keyboardEventFields : mouseEventFields;
        const cloneFields = {};
        for (let field of cloneFieldList)
        {
            cloneFields[field] = event[field]
        }
        return cloneFields;
    } 

}