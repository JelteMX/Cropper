/*global logger*/
/*
    Cropper
    ========================

    @file      : Cropper.js
    @version   : 1.0.0
    @author    : J.W. Lagendijk <jelte.lagendijk@mendix.com>
    @date      : 3/17/2016
    @copyright : Mendix 2016
    @license   : Apache 2

    Documentation
    ========================
    Describe your widget here.
*/

// Required module list. Remove unnecessary modules, you can always get them back from the boilerplate.
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

    "Cropper/lib/jquery",
    "dojo/text!Cropper/widget/template/Cropper.html",
    "Cropper/lib/cropper",
    "Cropper/lib/canvas-to-blob"
], function(declare, _WidgetBase, _TemplatedMixin, dom, dojoDom, dojoProp, dojoGeometry, dojoClass, dojoStyle, domAttr, dojoConstruct, dojoArray, lang, dojoText, dojoHtml, dojoEvent, _jQuery, widgetTemplate, cropper, dataURLtoBlob) {

    "use strict";

    var $ = _jQuery.noConflict(true),
        Upload = mendix.lib.Upload;


    return declare("Cropper.widget.Cropper", [ _WidgetBase, _TemplatedMixin ], {
        // _TemplatedMixin will create our dom node using this HTML template.
        templateString: widgetTemplate,

        // Parameters configured in the Modeler.
        targetWidth: 1000,
        targetHeight: 1000,
        targetColor: "#FFFFFF",
        lockTargetRatio: false,
        showPreview: true,
        showInfo: true,

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
                this._targetRatio = w/h;

                dojoClass.remove(this.nodeInfoResize, "hidden");
                dojoHtml.set(this.nodeInfoResizeText, "Width/height will be resized to: " + this.targetWidth + "px/" + this.targetHeight + "px");
            }

            if (!this.showPreview) {
                dojoClass.add(this.nodePreview, "hidden");
            }
            if (!this.showInfo) {
                dojoClass.add(this.nodeData, "hidden");
            }

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
          $(this.imageNode).cropper("destroy");
        },

        _setupEvents: function() {
            logger.debug(this.id + "._setupEvents");
            this.connect(this.saveButton, "click", lang.hitch(this, this.save));
        },

        _updateRendering: function(callback) {
            logger.debug(this.id + "._updateRendering");

            if (this._contextObj !== null) {
                if (!this._contextObj.isA("System.Image")) {
                    console.error(this.id + " context object is not a System.Image");
                    dojoStyle.set(this.domNode, "display", "none");
                } else {
                    dojoStyle.set(this.domNode, "display", "block");

                    this._imageName = this._contextObj.get("Name");
                    domAttr.set(this.imageNode, "src", this._getFileUrl(this._contextObj.getGuid()));

                    $(this.imageNode).cropper("destroy");

                    var cropperOptions = {
                        viewMode: 1,
                        dragMode: "move",
                        preview: "#" + this.id + " .img-preview",
                        crop: lang.hitch(this, this._onCrop)
                    };

                    if (this._targetRatio !== null) {
                        cropperOptions.aspectRatio = this._targetRatio;
                    }

                    $(this.imageNode).cropper(cropperOptions);
                }
            } else {
                dojoStyle.set(this.domNode, "display", "none");
            }

            mendix.lang.nullExec(callback);
        },

        _onCrop: function (e) {
            if (this.showInfo) {
                domAttr.set(this.nodeDataX, "value", Math.round(e.x));
                domAttr.set(this.nodeDataY, "value", Math.round(e.y));
                domAttr.set(this.nodeDataWidth, "value", Math.round(e.width));
                domAttr.set(this.nodeDataHeight, "value", Math.round(e.height));
                domAttr.set(this.nodeDataRotate, "value", e.rotate);
                domAttr.set(this.nodeDataScaleX, "value", e.scaleX);
                domAttr.set(this.nodeDataScaleY, "value", e.scaleY);
            }
        },

        save: function () {
            logger.debug(this.id + ".save");

            var canvas;
            if (this.lockTargetRatio) {
                canvas = $(this.imageNode).cropper("getCroppedCanvas", {
                    width: this.targetWidth,
                    height: this.targetHeight,
                    fillColor: this.targetColor
                });
            } else {
                canvas = $(this.imageNode).cropper("getCroppedCanvas");
            }

            var guid = this._contextObj.getGuid(),
                dataURI = canvas.toDataURL("image/jpeg"),
                file = dataURLtoBlob && dataURLtoBlob(dataURI);

            if (file) {
                var pid;
                file.fileName = this._imageName;

                var upload = new Upload({
                    objectGuid: guid,
                    maxFileSize: file.size,
                    startUpload: function() {
                        pid = window.mx.ui.showProgress();
                    },
                    finishUpload: function() {
                        window.mx.ui.hideProgress(pid);
                    },
                    form: {
                        mxdocument: {
                            files: [
                                file
                            ]
                        }
                    },
                    callback: lang.hitch(this, function () {
                        logger.debug(this.id + "._fileUploadRequest uploaded");
                        this._updateRendering();
                    }),
                    error: lang.hitch(this, function (err) {
                        console.error(this.id + "._fileUploadRequest error uploading", arguments);
                        this._updateRendering();
                    })
                });

                upload.upload();
            }


        },

        _getFileUrl: function (guid) {
            var changedDate = Math.floor(Date.now()); // Right now;
            return mx.appUrl + "file?" + [
                "target=internal",
                "guid=" + guid,
                "changedDate=" + changedDate
            ].join("&");
        },

        _resetSubscriptions: function() {
            logger.debug(this.id + "._resetSubscriptions");

            if (this._handles) {
                dojoArray.forEach(this._handles, function (handle) {
                    this.unsubscribe(handle);
                });
                this._handles = [];
            }

            if (this._contextObj) {
                var objectHandle = this.subscribe({
                    guid: this._contextObj.getGuid(),
                    callback: lang.hitch(this, function(guid) {
                        this._updateRendering();
                    })
                });

                this._handles = [ objectHandle ];
            }
        }
    });
});

require(["Cropper/widget/Cropper"], function() {
    "use strict";
});
