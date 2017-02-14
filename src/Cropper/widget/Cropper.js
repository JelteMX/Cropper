/*
    Cropper
    ========================

    @file      : Cropper.js
    @author    : J.W. Lagendijk <jelte.lagendijk@mendix.com>
    @copyright : Mendix 2016
    @license   : Apache 2
*/
define([
    "dojo/_base/declare",
    "mxui/widget/_WidgetBase",
    "dijit/_TemplatedMixin",

    "mxui/dom",
    "dojo/dom",
    "dojo/dom-prop",
    "dojo/dom-geometry",
    "dojo/dom-class",
    "dojo/dom-style",
    "dojo/dom-attr",
    "dojo/dom-construct",
    "dojo/_base/array",
    "dojo/_base/lang",
    "dojo/text",
    "dojo/html",
    "dojo/_base/event",

    "dojo/text!Cropper/widget/template/Cropper.html",
    "Cropper/lib/cropper",
    "Cropper/lib/canvas-to-blob"
], function(declare, _WidgetBase, _TemplatedMixin, dom, dojoDom, dojoProp, dojoGeometry, dojoClass, dojoStyle, domAttr, dojoConstruct, dojoArray, lang, dojoText, dojoHtml, dojoEvent, widgetTemplate, Cropper, dataURLtoBlob) {

    "use strict";

    var Upload = mendix.lib.Upload;

    return declare("Cropper.widget.Cropper", [_WidgetBase, _TemplatedMixin], {
        // _TemplatedMixin will create our dom node using this HTML template.
        templateString: widgetTemplate,

        // Parameters configured in the Modeler.
        targetWidth: 1000,
        targetHeight: 1000,
        targetColor: "#FFFFFF",
        lockTargetRatio: false,
        showPreview: true,
        showInfo: true,
        afterSaveMf: "",

        // DOM Nodes
        imageNode: null,
        nodePreview: null,
        nodeData: null,
        nodeDataX: null,
        nodeDataY: null,
        nodeDataWidth: null,
        nodeDataHeight: null,
        nodeInfoResize: null,
        nodeDataRotate: null,
        nodeDataScaleX: null,
        nodeDataScaleY: null,
        saveButton: null,

        // Internal variables. Non-primitives created in the prototype are shared between all widget instances.
        _handles: null,
        _contextObj: null,
        _setup: false,
        _imageName: null,
        _cropper: null,

        _rotation: 0,
        _scaleX: 1,
        _scaleY: 1,

        _targetRatio: null,

        constructor: function() {
            this._handles = [];
        },

        postCreate: function() {
            logger.debug(this.id + ".postCreate");

            if (this.targetColor === "" || this.targetColor.indexOf("#") !== 0) {
                this.targetColor = "#FFFFFF";
            }

            if (this.lockTargetRatio) {
                var w = this.targetWidth,
                    h = this.targetHeight;

                if (w <= 0) {
                    w = h > 0 ? h : 1000;
                }
                if (h <= 0) {
                    h = w > 0 ? w : 1000;
                }
                this.targetWidth = w;
                this.targetHeight = h;
                this._targetRatio = w / h;

                dojoClass.remove(this.nodeInfoResize, "hidden");
                dojoHtml.set(this.nodeInfoResizeText, "Width/height will be resized to: " + this.targetWidth + "px/" + this.targetHeight + "px");
            }

            dojoClass.toggle(this.nodePreview, "hidden", !this.showPreview);
            dojoClass.toggle(this.nodeData, "hidden", !this.showInfo);

            dojoClass.toggle(this.rotateButtons, "hidden", !this.enableRotation);
            dojoClass.toggle(this.nodeInfoRotation, "hidden", !this.enableRotation);

            dojoClass.toggle(this.flipButtons, "hidden", !this.enableFlipping);
            dojoClass.toggle(this.nodeInfoScaleX, "hidden", !this.enableFlipping);
            dojoClass.toggle(this.nodeInfoScaleY, "hidden", !this.enableFlipping);

            if (!this.showPreview && !this.showInfo) {
                dojoClass.replace(this.imageBox, "col-md-12", "col-md-9");
                dojoClass.add(this.sideBar, "hidden");
            }

            this._setupEvents();
        },

        update: function(obj, callback) {
            logger.debug(this.id + ".update");
            this._contextObj = obj;

            this._resetSubscriptions();
            this._updateRendering(callback);
        },

        enable: function() {
            logger.debug(this.id + ".enable");
        },

        disable: function() {
            logger.debug(this.id + ".disable");
        },

        resize: function(box) {
            //logger.debug(this.id + ".resize");
        },

        uninitialize: function() {
            logger.debug(this.id + ".uninitialize");
            this._destroyCropper();
        },

        _setupEvents: function() {
            logger.debug(this.id + "._setupEvents");

            this.connect(this.saveButton, "click", lang.hitch(this, this.save));

            if (this.enableRotation) {
                this.connect(this.rotateButtonLeft, "click", lang.hitch(this, this._rotate, 0 - this.rotationIncrement));
                this.connect(this.rotateButtonRight, "click", lang.hitch(this, this._rotate, this.rotationIncrement));
            }

            if (this.enableFlipping) {
                this.connect(this.flipButtonVertical, "click", lang.hitch(this, this._flip, true));
                this.connect(this.flipButtonHorizontal, "click", lang.hitch(this, this._flip, false));
            }
        },

        _rotate: function (rotation) {
            this._rotation += rotation;
            if (this._rotation < 0) {
                this._rotation += 360;
            } else if (this._rotation >= 360) {
                this._rotation -= 0;
            }

            if (this._cropper !== null) {
                this._cropper.rotateTo(this._rotation);
            }
        },

        _flip: function (vertical) {
            if (vertical) {
                this._scaleY *= -1;
            } else {
                this._scaleX *= -1;
            }

            console.log(this._scaleX, this._scaleY)
            if (this._cropper !== null) {
                this._cropper.scale(this._scaleX, this._scaleY);
            }
        },

        _resetValues: function () {
            this._rotation = 0;
            this._scaleX = 1;
            this._scaleY = 1;
        },

        _destroyCropper: function() {
            logger.debug(this.id + "._destroyCropper");
            this._resetValues();
            if (this._cropper !== null) {
                this._cropper.destroy();
                this._cropper = null;
            }
        },

        _updateRendering: function(callback) {
            logger.debug(this.id + "._updateRendering");

            if (this._contextObj !== null) {
                if (!this._contextObj.isA("System.Image")) {
                    console.error(this.id + " context object is not a System.Image");
                    dojoStyle.set(this.domNode, "display", "none");
                    this._executeCallback(callback, "_updateRendering");
                } else {
                    dojoStyle.set(this.domNode, "display", "block");

                    this._imageName = this._contextObj.get("Name");
                    domAttr.set(this.imageNode, "src", this._getFileUrl(this._contextObj.getGuid()));

                    this._destroyCropper();

                    var cropperOptions = {
                        viewMode: 1,
                        dragMode: "move",
                        autoCropArea: 1,
                        preview: "#" + this.id + " .img-preview",
                        crop: lang.hitch(this, this._onCrop),
                        ready: lang.hitch(this, function () {
                            this._executeCallback(callback, "_updateRendering cropper ready");
                        })
                    };

                    if (this._targetRatio !== null) {
                        cropperOptions.aspectRatio = this._targetRatio;
                    }

                    this._cropper = new Cropper(this.imageNode, cropperOptions);
                }
            } else {
                dojoStyle.set(this.domNode, "display", "none");
                this._executeCallback(callback, "_updateRendering");
            }
        },

        _onCrop: function(e) {
            if (this.showInfo) {
                domAttr.set(this.nodeDataX, "value", Math.round(e.detail.x));
                domAttr.set(this.nodeDataY, "value", Math.round(e.detail.y));
                domAttr.set(this.nodeDataWidth, "value", Math.round(e.detail.width));
                domAttr.set(this.nodeDataHeight, "value", Math.round(e.detail.height));
                domAttr.set(this.nodeDataRotate, "value", e.detail.rotate);
                domAttr.set(this.nodeDataScaleX, "value", e.detail.scaleX);
                domAttr.set(this.nodeDataScaleY, "value", e.detail.scaleY);
            }
        },

        save: function() {
            logger.debug(this.id + ".save");

            var canvas = this._cropper.getCroppedCanvas(this.lockTargetRatio ? {
                    width: this.targetWidth,
                    height: this.targetHeight,
                    fillColor: this.targetColor
                } : {});
            var guid = this._contextObj.getGuid(),
                dataURI = canvas.toDataURL("image/jpeg"),
                file = dataURLtoBlob && dataURLtoBlob(dataURI);

            if (file) {
                mx.data.saveDocument(guid, this._imageName, {}, file,
                    lang.hitch(this, function() {
                        if (this.afterSaveMf) {
                            this._execMf(this.afterSaveMf, guid, lang.hitch(this, this._updateRendering));
                        } else {
                            this._updateRendering();
                        }
                    }),
                    lang.hitch(this, function(e) {
                        // Error callback!
                        this._updateRendering();
                    })
                );
            } else {
                console.warn(this.id + ".save error: no file!");
            }
        },

        _getFileUrl: function(guid) {
            var changedDate = Math.floor(Date.now()); // Right now;
            return mx.appUrl + "file?" + [
                "target=internal",
                "guid=" + guid,
                "changedDate=" + changedDate
            ].join("&");
        },

        _resetSubscriptions: function() {
            logger.debug(this.id + "._resetSubscriptions");

            this.unsubscribeAll();

            if (this._contextObj) {
                this.subscribe({
                    guid: this._contextObj.getGuid(),
                    callback: lang.hitch(this, function(guid) {
                        this._updateRendering();
                    })
                });
            }
        },

        _execMf: function(mf, guid, cb) {
            logger.debug(this.id + "._execMf");
            if (mf && guid) {
                mx.ui.action(mf, {
                    params: {
                        applyto: "selection",
                        guids: [guid]
                    },
                    callback: lang.hitch(this, function(objs) {
                        if (cb && typeof cb === "function") {
                            cb(objs);
                        }
                    }),
                    error: function(error) {
                        console.debug(error.description);
                    }
                }, this);
            }
        },

        _executeCallback: function(cb, from) {
            logger.debug(this.id + "._executeCallback" + (from ? " from " + from : ""));
            if (cb && typeof cb === "function") {
                cb();
            }
        }
    });
});

require(["Cropper/widget/Cropper"]);
