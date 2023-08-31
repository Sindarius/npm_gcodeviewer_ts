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
//		'relatedTarget',
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

export default class ViewerProxy {

    webWorker: Worker
    mainCanvas: HTMLCanvasElement | null = null
    
    
    
    constructor(canvas: HTMLCanvasElement) {
        this.mainCanvas = canvas;
        this.webWorker = new ViewerWorker()
        //this.webWorker = new Worker(ViewerWorkerUrl);
        this.webWorker.onmessage = (e) => { this.onmessage(e) };
        this.webWorker.onerror = (e) => { this.onerror(e) };
        let offscreen = this.mainCanvas?.transferControlToOffscreen();
        this.webWorker.postMessage({ type: 'init', width: canvas.width, height: canvas.height, offscreencanvas : offscreen }, [offscreen])
    }

    onmessage(e: any) {
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

                target.addEventListener(e.data.eventName, (evt) => {
                    // We can`t pass original event to the worker
                    let eventClone = {}
                    try {
                        eventClone = that.cloneEvent(evt);
                    } catch (e) {
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
        }
    }

    onerror(e: any) {
            console.log('Error received from worker')
            console.log(e) 
    }

    init(): void {
      
    }

    cancel(): void{ 
        this.webWorker.postMessage({type: 'cancel', params: []})
    }

    cloneEvent(event) {
        const mouseEventCloned = {};
        for (let field of mouseEventFields)
        {
            mouseEventCloned[field] = event[field]
        }
        return mouseEventCloned;
    } 

    onCanvasEvent(event) { 
        //console.log('clone event', mouseEventCloned)
        //this.webWorker.postMessage({ type: 'canvasEvent', params: [ event.constructor.name, this.cloneEvent(event)] });
    }
   

}