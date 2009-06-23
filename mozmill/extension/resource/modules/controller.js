// ***** BEGIN LICENSE BLOCK *****
// Version: MPL 1.1/GPL 2.0/LGPL 2.1
// 
// The contents of this file are subject to the Mozilla Public License Version
// 1.1 (the "License"); you may not use this file except in compliance with
// the License. You may obtain a copy of the License at
// http://www.mozilla.org/MPL/
// 
// Software distributed under the License is distributed on an "AS IS" basis,
// WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
// for the specific language governing rights and limitations under the
// License.
// 
// The Original Code is Mozilla Corporation Code.
// 
// The Initial Developer of the Original Code is
// Adam Christian.
// Portions created by the Initial Developer are Copyright (C) 2008
// the Initial Developer. All Rights Reserved.
// 
// Contributor(s):
//  Adam Christian <adam.christian@gmail.com>
//  Mikeal Rogers <mikeal.rogers@gmail.com>
//  Henrik Skupin <hskupin@mozilla.com>
// 
// Alternatively, the contents of this file may be used under the terms of
// either the GNU General Public License Version 2 or later (the "GPL"), or
// the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
// in which case the provisions of the GPL or the LGPL are applicable instead
// of those above. If you wish to allow use of your version of this file only
// under the terms of either the GPL or the LGPL, and not to allow others to
// use your version of this file under the terms of the MPL, indicate your
// decision by deleting the provisions above and replace them with the notice
// and other provisions required by the GPL or the LGPL. If you do not delete
// the provisions above, a recipient may use your version of this file under
// the terms of any one of the MPL, the GPL or the LGPL.
// 
// ***** END LICENSE BLOCK *****

var EXPORTED_SYMBOLS = ["MozMillController", "sleep", "waitForEval", "MozMillAsyncTest",
                        "globalEventRegistry", "waitFor"];

var events = {}; Components.utils.import('resource://mozmill/modules/events.js', events);
var EventUtils = {}; Components.utils.import('resource://mozmill/modules/EventUtils.js', EventUtils); 
var utils = {}; Components.utils.import('resource://mozmill/modules/utils.js', utils);
var elementslib = {}; Components.utils.import('resource://mozmill/modules/elementslib.js', elementslib);
var frame = {}; Components.utils.import('resource://mozmill/modules/frame.js', frame);

var hwindow = Components.classes["@mozilla.org/appshell/appShellService;1"]
                .getService(Components.interfaces.nsIAppShellService)
                .hiddenDOMWindow;
var aConsoleService = Components.classes["@mozilla.org/consoleservice;1"].
     getService(Components.interfaces.nsIConsoleService);

function sleep (milliseconds) {
  var self = {};

  // We basically just call this once after the specified number of milliseconds
  function wait() {
    self.timeup = true;
  }

  // Calls repeatedly every X milliseconds until clearInterval is called
  var interval = hwindow.setInterval(wait, milliseconds);

  var thread = Components.classes["@mozilla.org/thread-manager;1"]
            .getService()
            .currentThread;
  // This blocks execution until our while loop condition is invalidated.  Note
  // that you must use a simple boolean expression for the loop, a function call
  // will not work.
  while(!self.timeup)
    thread.processNextEvent(true);
  hwindow.clearInterval(interval);

  return true;
}

function waitForEval (expression, timeout, interval, subject) {
  if (interval == undefined) {
    interval = 100;
  }
  if (timeout == undefined) {
    timeout = 30000;
  }
  
  var self = {};
  self.counter = 0;
  self.result = eval(expression);
  
  function wait(){
    self.result = eval(expression);
    self.counter += interval;
  }
  
  var timeoutInterval = hwindow.setInterval(wait, interval);
  
  var thread = Components.classes["@mozilla.org/thread-manager;1"]
            .getService()
            .currentThread;
  
  while((self.result != true) && (self.counter < timeout))  {
    thread.processNextEvent(true);
  }  
  if (self.counter < timeout) { var r = true; } 
  else { var r = false; }
  
  hwindow.clearInterval(timeoutInterval);
  
  return r;
}

function waitForImage(elem, timeout, interval) {
  if (interval == undefined) {
    interval = 100;
  }
  if (timeout == undefined) {
    timeout = 30000;
  }
  return waitForEval('subject.complete == true', timeout, interval, elem.getNode());
}

function waitForElement(elem, timeout, interval) {
  if (interval == undefined) {
    interval = 100;
  }
  if (timeout == undefined) {
    timeout = 30000;
  }
  return waitForEval('subject.exists()', timeout, interval, elem);
}

var Menu = function (elements, doc) {
  this.doc = doc;
  for each(node in elements) {
    if (node.tagName){
      if (node.tagName == "menu") {
        var label = node.getAttribute("label");
        var id = node.id;
        this[label] = new Menu(node.getElementsByTagName("menupopup")[0].childNodes);
        this[id] = this[label];
      } else if (node.tagName == "menuitem") {
        this[node.getAttribute("label")] = node;
        this[node.id] = node;
      } 
    }
  }
};

Menu.prototype.reload = function () {
  var elements = this.doc.getElementsByTagName('menubar')[0].childNodes;
  for each(node in elements) {
    if (node.tagName){
      if (node.tagName == "menu") {
        var label = node.getAttribute("label");
        var id = node.id;
        this[label] = new Menu(node.getElementsByTagName("menupopup")[0].childNodes);
        this[id] = this[label];
      } else if (node.tagName == "menuitem") {
        this[node.getAttribute("label")] = node;
        this[node.id] = node;
      } 
    }
  }
}

var MozMillController = function (window) {    
  // TODO: Check if window is loaded and block until it has if it hasn't.
  this.window = window;
  
  this.mozmillModule = {}; 
  Components.utils.import('resource://mozmill/modules/mozmill.js', this.mozmillModule);
  
  waitForEval("try { subject != null; } catch(err){}", 5000, undefined, window)
  waitForEval("try { subject.documentLoaded != undefined; } catch(err){}", 5000, undefined, window)

  if ( controllerAdditions[window.document.documentElement.getAttribute('windowtype')] != undefined ) {
    this.prototype = new utils.Copy(this.prototype);
    controllerAdditions[window.document.documentElement.getAttribute('windowtype')](this);
    this.windowtype = window.document.documentElement.getAttribute('windowtype');
  }

  //this will break on windows for addons and downloads controller
  try {
    this.menus = new Menu(this.window.document.getElementsByTagName('menubar')[0].childNodes, this.window.document);  
  } catch(err){}
  
}

MozMillController.prototype.keypress = function(el, aKey, modifiers) {
  var element = (el == null) ? this.window : el.getNode();
  if (!element) {
    throw new Error("could not find element " + el.getInfo());
    return false;
  }
  element.focus();
  events.triggerKeyEvent(element, 'keypress', aKey, modifiers);
  frame.events.pass({'function':'Controller.keypress()'});
  return true;
}

MozMillController.prototype.triggerKeyEvent = function(el, aKey, modifiers) {
  var element = (el == null) ? this.window : el.getNode();
  if (!element) {
    throw new Error("could not find element " + el.getInfo());
    return false;
  }
  element.focus();
  events.triggerKeyEvent(element, 'keypress', aKey, modifiers);
  frame.events.pass({'function':'Controller.keypress()'});
  return true;
}

MozMillController.prototype.type = function (el, text) {
  var element = (el == null) ? this.window : el.getNode();
  if (!element) {
    throw new Error("could not find element " + el.getInfo());
    return false;
  }

  for (var indx = 0; indx < text.length; indx++) {
    events.triggerKeyEvent(element, 'keypress', text.charAt(indx), {});
  }

  frame.events.pass({'function':'Controller.type()'});
  return true;
}

MozMillController.prototype.open = function(url){
  if (this.mozmillModule.Application == 'Firefox') {
    this.window.openLocation();
  } else if (this.mozmillModule.Application == 'SeaMonkey') {
    this.window.ShowAndSelectContentsOfURLBar();
  }
  
  var el = new elementslib.ID(this.window.document, 'urlbar');

  // Enter URL and press return
  this.type(el, url);
  events.triggerKeyEvent(el.getNode(), 'keypress', "VK_RETURN", {});

  frame.events.pass({'function':'Controller.open()'});
}

MozMillController.prototype.rightclick = function(el){
  var element = el.getNode();
  if (!element){ 
    throw new Error("could not find element " + el.getInfo());     
    return false; 
  }
  
  EventUtils.synthesizeMouse(element, 0, 0, { type : "contextmenu", button: 2 }, element.ownerDocument.defaultView);
  //var evt = element.ownerDocument.defaultView.document.createEvent('MouseEvents');
  //evt.initMouseEvent("click", true, true, element.ownerDocument.defaultView, 0, 0, 0, 0, 0, false, false, false, false, 2, null);
  return true;
}

MozMillController.prototype.click = function(el){
    //this.window.focus();
    var element = el.getNode();
    if (!element){ 
      throw new Error("could not find element " + el.getInfo());     
      return false; 
    }     
    try { events.triggerEvent(element, 'focus', false); }
    catch(err){ }
    
    //launch the click on firefox chrome
    if ((element.click) || (element.baseURI.indexOf('chrome://') != -1)){
      element.click();
      frame.events.pass({'function':'Controller.click()'});
      return true;
    }

    // Add an event listener that detects if the default action has been prevented.
    // (This is caused by a javascript onclick handler returning false)
    // we capture the whole event, rather than the getPreventDefault() state at the time,
    // because we need to let the entire event bubbling and capturing to go through
    // before making a decision on whether we should force the href
    var savedEvent = null;
    element.addEventListener('click', function(evt) {
        savedEvent = evt;
    }, false);
    // Trigger the event.
    events.triggerMouseEvent(element, 'mousedown', true);
    events.triggerMouseEvent(element, 'mouseup', true);
    events.triggerMouseEvent(element, 'click', true);
    // Perform the link action if preventDefault was set.
    // In chrome URL, the link action is already executed by triggerMouseEvent.
    if (!utils.checkChrome && savedEvent != null && !savedEvent.getPreventDefault()) {
        // if (element.href) {
        //     this.open(element.href);
        // } 
        // else {
        var itrElement = element;
        while (itrElement != null) {
          // if (itrElement.href) {
          //   this.open(itrElement.href);
          //   break;
          // }
          itrElement = itrElement.parentNode;
          // }
        }
    }
    frame.events.pass({'function':'Controller.click()'});
    return true;
};

MozMillController.prototype.sleep = sleep;
MozMillController.prototype.waitForEval = function (expression, timeout, interval, subject) {
  var r = waitForEval(expression, timeout, interval, subject);
  if (!r) {
    throw new Error("timeout exceeded for waitForEval('"+expression+"')");
  }
}
MozMillController.prototype.waitForElement = function (elem, timeout, interval) {
  var r = waitForElement(elem, timeout, interval);
  if (!r) {
    throw new Error("timeout exceeded for waitForElement "+elem.getInfo());
  }
}
MozMillController.prototype.waitForImage = function (elem, timeout, interval) {
  var r = waitForImage(elem, timeout, interval);
  if (!r) {
    throw new Error("timeout exceeded for waitForImage "+elem.getInfo());
  }
}
MozMillController.prototype.waitThenClick = function (elem, timeout, interval) {
  this.waitForElement(elem, timeout, interval);
  this.click(elem);
}

/* Select the specified option and trigger the relevant events of the element.*/
MozMillController.prototype.select = function (el, indx, option, value) {
  //this.window.focus();
  element = el.getNode();
  if (!element){ 
    throw new Error("could not find element " + el.getInfo());     
    return false; 
  }
  
  //if we have a select drop down
  if (element.localName.toLowerCase() == "select"){
    if (indx != undefined) {
     element.options.selectedIndex = indx;
     frame.events.pass({'function':'Controller.select()'});
     return true;
    }

   try{ events.triggerEvent(element, 'focus', false);}
   catch(err){};

   var optionToSelect = null;
   for (var opt=0;opt<element.options.length;opt++){
     el = element.options[opt];

     if (option != undefined){
       if(el.innerHTML.indexOf(option) != -1){
         if (el.selected && el.options[opt] == optionToSelect){
           continue;
         }
         optionToSelect = el;
         optionToSelect.selected = true;
         events.triggerEvent(element, 'change', true);
         break;
       }
     }
     else{
        if(el.value.indexOf(value) != -1){
           if (el.selected && el.options[opt] == optionToSelect){
             continue;
           }
           optionToSelect = el;
           optionToSelect.selected = true;
           events.triggerEvent(element, 'change', true);
           break;
         }
     }
   }
   if (optionToSelect == null){
     throw new Error('optionsToSelect == null')
     return false;
   }
  }
  //if we have a xul menulist select accordingly
  else if (element.localName.toLowerCase() == "menulist"){
    var success = false;
    
    if (indx >= 0) {
      element.selectedIndex = indx;
      success = true;
    } else if (value != undefined && value != null){
      element.selectedIndex = value;
      success == true;
    } else if (option != undefined && value != null){
      //iterate items to find the one with the correct option string
      for (var i=1;i<element.itemCount; i++){
        if (element.getItemAtIndex(i).label == option){
          element.selectedIndex = i;
          success = true;
        }
      }
    }
    if (!success){
      throw new Error('No item selected.')
      return false;
    }
  }

   frame.events.pass({'function':'Controller.select()'});
   return true;
};

//Directly access mouse events
MozMillController.prototype.mousedown = function (el){
  //this.window.focus();
  var mdnElement = el.getNode();
  events.triggerMouseEvent(mdnElement, 'mousedown', true);    
  frame.events.pass({'function':'Controller.mousedown()'});
  return true;
};

MozMillController.prototype.mouseup = function (el){
  //this.window.focus();
  var mupElement = el.getNode();
  events.triggerMouseEvent(mdnElement, 'mupElement', true);  
  frame.events.pass({'function':'Controller.mouseup()'});
  return true;
};

MozMillController.prototype.mouseover = function (el){
  //this.window.focus();
  var mdnElement = el.getNode();
  events.triggerMouseEvent(mdnElement, 'mouseover', true);  
  frame.events.pass({'function':'Controller.mouseover()'});
  return true;
};

MozMillController.prototype.mouseout = function (el){
  //this.window.focus();
  var moutElement = el.getNode();
  events.triggerMouseEvent(moutElement, 'mouseout', true);
  frame.events.pass({'function':'Controller.mouseout()'});
  return true;
};

//Browser navigation functions
MozMillController.prototype.goBack = function(){
  //this.window.focus();
  this.window.content.history.back();
  frame.events.pass({'function':'Controller.goBack()'});
  return true;
}
MozMillController.prototype.goForward = function(){
  //this.window.focus();
  this.window.content.history.forward();
  frame.events.pass({'function':'Controller.goForward()'});
  return true;
}
MozMillController.prototype.refresh = function(){
  //this.window.focus();
  this.window.content.location.reload(true);
  frame.events.pass({'function':'Controller.refresh()'});
  return true;
}

//there is a problem with checking via click in safari
MozMillController.prototype.check = function(el){
  //this.window.focus();
  var element = el.getNode();
  return MozMillController.click(element);    
}

//Radio buttons are even WIERDER in safari, not breaking in FF
MozMillController.prototype.radio = function(el){
  //this.window.focus();
  var element = el.getNode();
  return MozMillController.click(element);      
}

//Double click for Mozilla
MozMillController.prototype.doubleClick = function(el) {
   //this.window.focus();
   var element = el.getNode();
   if (!element){ 
    throw new Error("could not find element " + el.getInfo());     
    return false; 
   } 
   events.triggerEvent(element, 'focus', false);
   events.triggerMouseEvent(element, 'dblclick', true);
   events.triggerEvent(element, 'blur', false);
 
   frame.events.pass({'function':'Controller.doubleClick()'});
   return true;
};


MozMillController.prototype.assertText = function (el, text) {
  //this.window.focus();
  var n = el.getNode();

  if (n.innerHTML == text){ 
    frame.events.pass({'function':'Controller.assertText()'});
    return true; 
   }

  throw new Error("could not validate element " + el.getInfo()+" with text "+ text);
  return false;
  
};

//Assert that a specified node exists
MozMillController.prototype.assertNode = function (el) {
  //this.window.focus();
  var element = el.getNode();
  if (!element){ 
    throw new Error("could not find element " + el.getInfo());     
    return false; 
  }
  frame.events.pass({'function':'Controller.assertNode()'});
  return true;
};

// Assert that a specified node doesn't exist
MozMillController.prototype.assertNodeNotExist = function (el) {
  //this.window.focus();
  var element = el.getNode();
  if (!element){ 
    frame.events.pass({'function':'Controller.assertNodeNotExist()'});
    return true; 
  }
  throw new Error("Unexpectedly found element " + el.getInfo());     
  return false;
};

//Assert that a form element contains the expected value
MozMillController.prototype.assertValue = function (el, value) {
  //this.window.focus();
  var n = el.getNode();

  if (n.value == value){
    frame.events.pass({'function':'Controller.assertValue()'});
    return true; 
  }
  throw new Error("could not validate element " + el.getInfo()+" with value "+ value);
  return false;
};

//Assert that a provided value is selected in a select element
MozMillController.prototype.assertJS = function (js) {
  //this.window.focus();
  var result = eval(js);
  if (result){ 
    frame.events.pass({'function':'Controller.assertJS()'});
    return result; 
  }
  
  else{ 
    throw new Error("javascript assert was not succesful"); 
    return result;}
};

//Assert that a provided value is selected in a select element
MozMillController.prototype.assertSelected = function (el, value) {
  //this.window.focus();
  var n = el.getNode();
  var validator = value;

  if (n.options[n.selectedIndex].value == validator){ 
    frame.events.pass({'function':'Controller.assertSelected()'});
    return true; 
    }
  throw new Error("could not assert value for element " + el.getInfo()+" with value "+ value);
  return false;
};

//Assert that a provided checkbox is checked
MozMillController.prototype.assertChecked = function (el) {
  //this.window.focus();
  var n = el.getNode();

  if (n.checked == true){ 
    frame.events.pass({'function':'Controller.assertChecked()'});
    return true; 
    }
  throw new Error("assert failed for checked element " + el.getInfo());
  return false;
};

// Assert that a an element's property is a particular value
MozMillController.prototype.assertProperty = function(el, attrib, val) {
  var element = el.getNode();
  if (!element){
    throw new Error("could not find element " + el.getInfo());     
    return false;
  }
  var value = eval ('element.' + attrib+';');
  var res = false;
  try {
    if (value.indexOf(val) != -1){
      res = true;
    }
  }
  catch(err){
  }
  if (String(value) == String(val)) {
    res = true;
  }
  if (res) {
    frame.events.pass({'function':'Controller.assertProperty()'});
  } else {
    throw new Error('Controller.assertProperty() failed');
  }
  
  return res;
};

// Assert that a specified image has actually loaded
// The Safari workaround results in additional requests
// for broken images (in Safari only) but works reliably
MozMillController.prototype.assertImageLoaded = function (el) {
  //this.window.focus();
  var img = el.getNode();
  if (!img || img.tagName != 'IMG') {
    throw new Error('Controller.assertImageLoaded() failed.')
    return false;
  }
  var comp = img.complete;
  var ret = null; // Return value

  // Workaround for Safari -- it only supports the
  // complete attrib on script-created images
  if (typeof comp == 'undefined') {
    test = new Image();
    // If the original image was successfully loaded,
    // src for new one should be pulled from cache
    test.src = img.src;
    comp = test.complete;
  }

  // Check the complete attrib. Note the strict
  // equality check -- we don't want undefined, null, etc.
  // --------------------------
  // False -- Img failed to load in IE/Safari, or is
  // still trying to load in FF
  if (comp === false) {
    ret = false;
  }
  // True, but image has no size -- image failed to
  // load in FF
  else if (comp === true && img.naturalWidth == 0) {
    ret = false;
  }
  // Otherwise all we can do is assume everything's
  // hunky-dory
  else {
    ret = true;
  }
  if (ret) {
    frame.events.pass({'function':'Controller.assertImageLoaded'});
  } else {
    throw new Error('Controller.assertImageLoaded() failed.')
  }
  
  return ret;
};

//Drag one eleent to the top x,y coords of another specified element
MozMillController.prototype.mouseMove = function (doc, start, dest) {
  //if one of these elements couldn't be looked up
  if (typeof start != 'object'){
    throw new Error("received bad coordinates");     
    return false;
  }
  if (typeof dest != 'object'){
    throw new Error("received bad coordinates");     
    return false;
  }
    
  //Do the initial move to the drag element position
  events.triggerMouseEvent(doc.body, 'mousemove', true, start[0], start[1]);
  events.triggerMouseEvent(doc.body, 'mousemove', true, dest[0], dest[1]);  
  frame.events.pass({'function':'Controller.mouseMove()'});
  return true;
}

//Drag one eleent to the top x,y coords of another specified element
MozMillController.prototype.dragDropElemToElem = function (dstart, ddest) {
  //Get the drag and dest
  var drag = dstart.getNode();
  var dest = ddest.getNode();
  
  //if one of these elements couldn't be looked up
  if (!drag){
    throw new Error("could not find element " + drag.getInfo());     
    return false;
  }
  if (!dest){
    throw new Error("could not find element " + dest.getInfo());     
    return false;
  }
 
  var dragCoords = null;
  var destCoords = null; 

  dragCoords = drag.getBoundingClientRect();
  destCoords = dest.getBoundingClientRect();
    
  //Do the initial move to the drag element position
  events.triggerMouseEvent(drag.ownerDocument.body, 'mousemove', true, dragCoords.left, dragCoords.top);
  events.triggerMouseEvent(drag, 'mousedown', true, dragCoords.left, dragCoords.top); //do the mousedown
  events.triggerMouseEvent(drag.ownerDocument.body, 'mousemove', true, destCoords.left, destCoords.top); 
  events.triggerMouseEvent(dest, 'mouseup', true, destCoords.left, destCoords.top);
  events.triggerMouseEvent(dest, 'click', true, destCoords.left, destCoords.top);
  frame.events.pass({'function':'Controller.dragDropElemToElem()'});
  return true;
}

var waitFor = function (node, events) {
  if (node.getNode != undefined) {
    node = node.getNode();
  }
  this.events = events;
  this.node = node;
  node.firedEvents = {}
  this.registry = {};
  for each(e in events) {
    var listener = function (event) {
      this.firedEvents[event.type] = true;
    }
    this.registry[e] = listener;
    this.registry[e].result = false;
    this.node.addEventListener(e, this.registry[e], true);
  }
}
waitFor.prototype.wait = function (timeout, interval) {
  for (e in this.registry) {
    var r = waitForEval("subject['"+e+"'] == true", timeout, interval, this.node.firedEvents)
    if (!r) {
        throw "Event didn't fire before timeout. event == "+e+", result is "+this.registry[e].result;
      }
    this.node.removeEventListener(e, this.registry[e], true);
  }
  
}

function preferencesAdditions(controller) {
  var mainTabs = controller.window.document.getAnonymousElementByAttribute(controller.window.document.documentElement, 'anonid', 'selector');
  controller.tabs = {};
  for (var i = 0; i < mainTabs.childNodes.length; i++) {
    var node  = mainTabs.childNodes[i];
    var obj = {'button':node}
    controller.tabs[i] = obj;
    var label = node.attributes.item('label').value.replace('pane', '');
    controller.tabs[label] = obj;
  }
  controller.prototype.__defineGetter__("activeTabButton", 
    function () {return mainTabs.getElementsByAttribute('selected', true)[0]; 
  })
}

function Tabs (controller) {
  this.controller = controller;
}
Tabs.prototype.getTab = function(index) {
  return this.controller.window.gBrowser.browsers[index].contentDocument;
}
Tabs.prototype.__defineGetter__("activeTab", function() {
  return this.controller.window.gBrowser.selectedBrowser.contentDocument;
})
Tabs.prototype.selectTab = function(index) {
  // GO in to tab manager and grab the tab by index and call focus.
}
Tabs.prototype.findWindow = function (doc) {
  for (i=0;i<=(this.controller.window.frames.length-1);i++) {
    if (this.controller.window.frames[i].document == doc) {
      return this.controller.window.frames[i];
    }
  }
  throw "Cannot find window for document. Doc title == "+doc.title;
}
Tabs.prototype.getTabWindow = function(index) {
  return this.findWindow(this.getTab(index));
}
Tabs.prototype.__defineGetter__("activeTabWindow", function () {
  return this.findWindow(this.activeTab);
})
Tabs.prototype.__defineGetter__("length", function () {		
  return this.controller.window.gBrowser.browsers.length;		
})

function browserAdditions( controller ) {
  controller.tabs = new Tabs(controller);
  controller.waitForPageLoad = function(_document, timeout, interval) {
    //if a user tries to do waitForPageLoad(2000), this will assign the interval the first arg
    //which is most likely what they were expecting
    if (typeof(_document) == "number"){
      var timeout = _document;
    }
    //incase they pass null
    if (_document == null){
      _document = 0;
    }
    //if _document isn't a document object
    if (typeof(_document) != "object") {
      var _document = controller.tabs.activeTab;
    }
    
    if (interval == undefined) {
      var interval = 100;
    }
    if (timeout == undefined) {
      var timeout = 30000;
    }
    
    waitForEval("subject.documentLoaded == true", timeout, interval, _document.defaultView);
    //Once the object is available it's somewhere between 1 and 3 seconds before the DOM
    //Actually becomes available to us
    sleep(100);
  }
}

controllerAdditions = {
  'Browser:Preferences':preferencesAdditions,
  'navigator:browser'  :browserAdditions,
}

var withs = {}; Components.utils.import('resource://mozmill/stdlib/withs.js', withs);

MozMillAsyncTest = function (timeout) { 
  if (timeout == undefined) {
    this.timeout = 6000;
  } else {
    this.timeout = timeout;
  }
  this._done = false;
  this._mozmillasynctest = true;
}

MozMillAsyncTest.prototype.run = function () {
  for (i in this) {
    if (withs.startsWith(i, 'test') && typeof(this[i]) == 'function') {
      this[i]();
    }
  }
  
  var r = waitForEval("subject._done == true", this.timeout, undefined, this);
  if (r == true) {
    return true;
  } else {
    throw "MozMillAsyncTest did not finish properly: timed out. Done is "+this._done
  }
}
MozMillAsyncTest.prototype.finish = function () {
  this._done = true;
}
