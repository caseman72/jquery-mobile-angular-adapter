/**
 * Helper functions for proxying jquery widgets and angular widgets.
 */
define(['jqmng/jquery', 'angular', 'jqmng/globalScope', 'jqmng/widgets/jqmPage'], function($, angular, globalScope, page) {
    /*
     * Integration of the widgets of jquery mobile:
     * Prevent the normal create call for the widget, and let angular
     * do the initialization. This is important as angular
     * might create multiple elements with the widget (e.g. in ng:repeat), and the widgets of jquery mobile
     * register listeners to elements.
     */
    function createJqmWidgetProxy(jqmWidget) {
        var oldWidget = $.fn[jqmWidget];
        $.fn[jqmWidget] = function(options) {
            var instanceExists = this.data() && this.data()[jqmWidget];
            if (instanceExists || this.length == 0) {
                return oldWidget.apply(this, arguments);
            } else if (page.inJqmPageCompile()) {
                // Prevent initialization during precompile,
                // and mark the element so that the angular widget
                // can create the widget!
                for (var i = 0; i < this.length; i++) {
                    this[i].jqmoptions = options;
                    // Note that there may be more than 1 jqm widgets per
                    // element in the dom. E.g. <input type="range"> creates
                    // a textinput and a slider widget for the same element!
                    var jqmwidgets = this[i].jqmwidgets || {};
                    jqmwidgets[jqmWidget] = true;
                    this[i].jqmwidgets = jqmwidgets;
                }
                // Also save the jqmwidgets in the attributes.
                // By this, they are also available if the element was cloned.
                // Needed by the disabled flag handling!
                var jqmwidgetsList = [];
                for (var widget in jqmwidgets) {
                    jqmwidgetsList.push(widget);
                }
                this.attr('jqmwidgets', jqmwidgetsList.join(','));
                return this;
            } else {
                return oldWidget.apply(this, arguments);
            }
        };
        for (var key in oldWidget) {
            $.fn[jqmWidget][key] = oldWidget[key];
        }
    }


    /**
     * Creates a proxy around an existing angular widget.
     * Needed to use the angular functionalities like disabled handling,
     * invalidWidgets marking, formatting and validation.
     * @param tagname
     * @param compileFn
     */
    function createAngularWidgetProxy(tagname, compileFn) {

        var oldWidget = angular.widget(tagname);
        angular.widget(tagname, function() {
            var oldBinder;
            var bindFn = compileFn.apply(this, arguments);
            var newBinder = function() {
                var elementArgumentPos = (oldBinder && oldBinder.$inject && oldBinder.$inject.length) || 0;
                var element = arguments[elementArgumentPos];
                var self = this;
                var myargs = arguments;
                var oldBinderCalled = false;
                var res;
                if (bindFn) {
                    res = bindFn.call(this, element, function() {
                        oldBinderCalled = true;
                        return oldBinder && oldBinder.apply(self, myargs);
                    });
                }
                if (!oldBinderCalled) {
                    return oldBinder && oldBinder.apply(self, myargs);
                }
                return res;
            }
            // execute the angular compiler after our compiler!
            oldBinder = oldWidget && oldWidget.apply(this, arguments);
            if (!oldWidget) {
                this.descend(true);
                this.directives(true);
            }

            newBinder.$inject = oldBinder && oldBinder.$inject;
            return newBinder;
        });
    }

    /**
     * Creates a proxy around an existing angular directive.
     * Needed e.g. to intercept the disabled handling, ...
     * @param directiveName
     * @param compileFn
     */
    function createAngularDirectiveProxy(directiveName, compileFn) {
        var oldDirective = angular.directive(directiveName);
        angular.directive(directiveName, function(expression) {
            var oldBinder = oldDirective.apply(this, arguments);
            var bindFn = compileFn(expression);
            var newBinder = function() {
                var elementArgumentPos = (oldBinder.$inject && oldBinder.$inject.length) || 0;
                var element = arguments[elementArgumentPos];
                var scope = this;
                var res = oldBinder.apply(this, arguments);
                bindFn.call(this, element);
                return res;
            }
            newBinder.$inject = oldBinder.$inject;
            return newBinder;
        });
    }

    /**
     * Removes all elements from list1 that are contained in list2
     * and returns a new list.
     * @param list1
     * @param list2
     */
    function minusArray(list1, list2) {
        var res = [];
        // temporarily add marker...
        for (var i=0; i<list2.length; i++) {
            list2[i].diffMarker = true;
        }
        for (var i=0; i<list1.length; i++) {
            if (!list1[i].diffMarker) {
                res.push(list1[i]);
            }
        }
        for (var i=0; i<list2.length; i++) {
            delete list2[i].diffMarker;
        }
        return res;
    }

    function recordDomAdditions(selector, callback) {
        var oldState = $(selector);
        callback();
        var newState = $(selector);
        return minusArray(newState, oldState);
    }

    var garbageCollector = [];
    var afterEvalQueue = [];

    function isConnectedToDocument(element) {
        var rootElement = document.documentElement;
        while (element!==null && element!==rootElement) {
            element = element.parentNode;
        }
        return element===rootElement;
    }

    function removeSlaveElements() {
        var rootElement = document.documentElement;
        for (var i=0; i<garbageCollector.length; i++) {
            var entry = garbageCollector[i];
            if (!isConnectedToDocument(entry.master[0])) {
                entry.slaves.remove();
                garbageCollector.splice(i, 1);
                i--;
            }
        }
    }

    function removeSlavesWhenMasterIsRemoved(master, slaves) {
        garbageCollector.push({master: master, slaves:slaves});
    }

    function executeAfterEvalQueue() {
        while (afterEvalQueue.length>0) {
            var callback = afterEvalQueue.shift();
            callback();
        }
    }

    function afterEvalCallback(callback) {
        afterEvalQueue.push(callback);
    }

    globalScope.onCreate(function(scope) {
        scope.$onEval(99999, function() {
            executeAfterEvalQueue();
            removeSlaveElements();
        });
    });


    return {
        recordDomAdditions: recordDomAdditions,
        createAngularDirectiveProxy: createAngularDirectiveProxy,
        createAngularWidgetProxy: createAngularWidgetProxy,
        createJqmWidgetProxy: createJqmWidgetProxy,
        afterEvalCallback: afterEvalCallback,
        removeSlavesWhenMasterIsRemoved: removeSlavesWhenMasterIsRemoved
    }
});