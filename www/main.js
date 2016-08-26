FormModel = Backbone.Model.extend({
    idAttribute: 'Hash',
    sync: function(method, model, options) {
        if (method == "read") {
            this.loadForm();
        }
    },
    defaults: {
        "Theme": "",
        "Pages": [],
        "Rules": [],
        "active_page": null,
        "page_history": []
    },
    loadForm: function() {
        var formId = this.get("formId");
        var self = this;
        $fh.forms.getForm({
            "formId": formId
        }, function(err, form) {
            if (err) {
                self.trigger("error", err);
            } else {
                self.coreModel = form;
                self.set("fh_full_data_loaded", true);
                self.id = formId;
            }
        });
    },
    get: function(key) {
        var res = Backbone.Model.prototype.get.apply(this, arguments);
        if (res && res !== "") {
            return res;
        } else if (this.coreModel) {
            return this.coreModel.get(key);
        } else {
            return res;
        }
    },
    initialize: function() {
        _.bindAll(this, "loadForm", "get");
        this.loadForm();
    }
});

FormsCollection = Backbone.Collection.extend({
    model: FormModel,
    comparator: 'name',
    sync: function(method, collection, options) {
        var self = this;
        if (method == "read") {
            $fh.forms.getForms({
                fromRemote: true
            }, function(err, formList) {
                if (err) {
                    self.trigger("error", err);
                    options.error(err);
                } else {
                    var count = formList.size();
                    var formIdArr = [];
                    for (var i = 0; i < formList.size(); i++) {
                        var formId = formList.getFormIdByIndex(i);
                        var formMeta = formList.getFormMetaById(formId);
                        formIdArr.push({
                          name: formMeta.name,
                          formId: formId
                        });
                    }

                    options.success(formIdArr);
                }
            });
        }
    }
});

App.collections.forms = new FormsCollection();

SubmissionModel = Backbone.Model.extend({
    sync: function(method, model, options) {
        var self = this;
        if (method == "read") {
            this.loadSubmission(this.submissionMeta, function(err, sub) {});
        } else if (method == "delete") {
            this.coreModel.clearLocal(function() {});
        } else {
            console.log("Should not be here");
        }
    },
    loadSubmission: function(submissionMeta, cb) {
        var self = this;
        $fh.forms.getSubmissions({}, function(err, subList) {
            subList.getSubmissionByMeta(submissionMeta, function(err, submission) {
                if (err) {
                    self.trigger("error", err);
                } else {
                    self.coreModel = submission;
                    self.id = submission.getLocalId();
                }

                self.coreModel.clearEvents();
                self.initModel();
                self.trigger("change");

                cb(err, submission);
            });
        });
    },
    deleteSubmission: function(cb) {
        var self = this;
        self.loadSubmission(self.submissionMeta, function(err) {
            if (err) {
                $fh.forms.log.e("Error Loading Submission: ", err);
            } else {
                self.coreModel.clearLocal(function(err) {
                    if (err) console.error("Error clearing local: ", err);

                    if (cb) {
                        return cb(err);
                    }
                    return false;
                });
            }
        });
    },
    initModel: function() {
        var coreModel = this.coreModel;
        var self = this;
        coreModel.on("inprogress", function(ut) {
            self.refreshAllCollections();
        });
        coreModel.on("submitted", function(submissionId) {
            AlertView.showAlert("Submission Upload Complete", "success", 1000);
            self.refreshAllCollections();
        });
        coreModel.on("submit", function() {
            self.refreshAllCollections();
        });
        coreModel.on("error", function() {
            AlertView.showAlert("Error Uploading Submission", "error", 1000);
            self.refreshAllCollections();
        });
        coreModel.on("queued", function() {
            AlertView.showAlert("Submission Queued for Upload", "info", 1000);
            self.refreshAllCollections();
        });
        coreModel.on("progress", function(progress) {
            App.views.pending_list.updateSubmissionProgress(progress, this.getLocalId());
        });
    },
    refreshAllCollections: function() {
        refreshSubmissionCollections();
    },
    get: function(key) {
        var res = Backbone.Model.prototype.get.apply(this, arguments);
        if (res && res !== "") {
            return res;
        } else if (this.coreModel) {
            return this.coreModel.get(key);
        } else {
            return res;
        }
    },
    initialize: function(submissionMeta, options) {
        var self = this;
        this.submissionMeta = submissionMeta;
        this.loadSubmission(submissionMeta, function(err, sub) {});
    }
});
SubmissionCollection = Backbone.Collection.extend({
    model: SubmissionModel,
    status: null,
    initialize: function() {
        Backbone.Collection.prototype.initialize.apply(this, arguments);
    },
    getSubmissionList: function(cb) {
        var self = this;
        self.reset();
        $fh.forms.getSubmissions({}, function(err, subList) {

            if (err) {
                console.log(err);
                cb(err);
            } else {
                var status = self.status;
                var sortField = self.sortField;
                var submissions = subList.getSubmissions();
                if (status) {
                    submissions = subList.findByStatus({
                        sortField: sortField,
                        status: status
                    });
                }
                self.coreModel = subList;
                if (self.models.length > submissions.length) {
                    self.length = submissions.length;
                }

                console.log("$fh.forms.getSubmissions", self.status, submissions);

                cb(null, submissions);
            }
        });
    },
    clearSentSubmissions: function(cb) {
        var self = this;
        self.coreModel.clearSentSubmission(function(err) {
            console.log("Clear Sent Submissions Finished", err);
            if (err) {
                return cb(err);
            }
            self.fetch();
            return cb();
        });
    },
    sync: function(method, collection, options) {
        if (method == "read") {
            this.getSubmissionList(function(err, submissions) {
                if (err) {
                    options.error(err);
                } else {
                    options.success(submissions);
                }
            });
        }
    }
});

SentModel = SubmissionModel.extend({});

SentCollection = SubmissionCollection.extend({
    status: "submitted",
    model: SentModel,
    sortField: "submittedDate"
});
PendingModel = SubmissionModel.extend({

});

PendingWaitingCollection = SubmissionCollection.extend({
    status: ["pending", "inprogress"],
    sortField: "submitDate"
});
PendingSubmittingCollection = SubmissionCollection.extend({
    status: "queued",
    sortField: "uploadStartDate"
});

PendingReviewCollection = SubmissionCollection.extend({
    status: "error",
    sortField: "uploadStartDate"
});

DraftModel = SubmissionModel.extend({});

DraftsCollection = SubmissionCollection.extend({
    model: DraftModel,
    status: "draft",
    sortField: "saveDate"
});


App.collections.drafts = new DraftsCollection();
App.collections.pending_submitting = new PendingSubmittingCollection();
App.collections.sent = new SentCollection();
App.collections.pending_review = new PendingReviewCollection();
App.collections.pending_waiting = new PendingWaitingCollection();

function refreshSubmissionCollections() {
    console.log("Refreshing All Collections");
    App.collections.drafts.fetch();
    App.collections.sent.fetch();
    App.collections.pending_submitting.fetch();
    App.collections.pending_waiting.fetch();
    App.collections.pending_review.fetch();
}
LoadingView = Backbone.View.extend({
    id: 'loading',
    className: '',

    templates: {
        spinner: '<div class="modal" id="pleaseWaitDialog" data-backdrop="static" data-keyboard="false"><div class="modal-header"><h1>Processing...</h1></div><div class="modal-body"><div class="progress progress-striped active"><div class="bar" style="width: 100%;"></div></div></div></div>'
    },

    initialize: function(model) {
        var self = this;

        this.percent = 0;
        _.bindAll(this, 'destroyView', "modelLoaded");

        $('#myModal').modal();

        if (model != null) {
            this.model = model;
            // bind to model change and error events if model not fully loaded yet
            if (!this.model.get('fh_full_data_loaded')) {
                this.listenTo(this.model, 'change:fh_full_data_loaded', self.modelLoaded);
                this.listenTo(this.model, 'error', self.modelLoadError);
            } else {
                // async behaviour
                setTimeout(function() {
                    self.modelLoaded(this.model);
                }, 0);
            }
        }
    },

    modelLoaded: function(a, b, c) {
        var self = this;
        this.model.set('fh_error_loading', false);
        this.updateMessage("Form synced");
        this.updateProgress(100);
        setTimeout(function() {
            self.hide();
        }, 1000);
    },

    modelLoadError: function(model, b, c) {
        var self = this;
        this.model.set('fh_error_loading', true);
        this.updateMessage("Error syncing form");
        this.updateProgress(100);
        setTimeout(function() {
            self.hide();
        }, 1000);
    },

    addError: function() {
        $('#myModal .progress-bar').addClass('progress-bar-danger');
    },

    removeError: function() {
        $('#myModal .progress-bar').removeClass('progress-bar-danger');
    },

    show: function(message, progress) {
        this.reset();

        this.updateMessage(message);
        if (!_.isNumber(progress)) {
            progress = 20;
        }
        this.updateProgress(progress); // halfway straight away. only a single step process

        this.$el.show();
    },

    updateMessage: function(message) {
        $('#myModalLabel').html(message);
    },

    updateProgress: function(progress) {
        $('#myModal .progress-bar').css('width', progress + '%');
    },

    reset: function() {
        this.removeError();
        this.updateProgress(5);
        this.updateMessage('');
        this.percent = 0;
        this.formsCounter = -1;
        this.totalCounter = 0;
    },

    hide: function() {
        var self = this;
        setTimeout(function(){
            $('#myModal').modal('hide');   
            self.destroyView(); 
        }, 500);
    },

    destroyView: function() {
        $(this.$el).removeData().unbind();

        if (this.model != null) {
            this.model.off(null, null, this);
        }

        //Remove view from DOM
        this.remove();
        Backbone.View.prototype.remove.call(this);
    }
});
LoadingCollectionView = LoadingView.extend({

    initialize: function() {
        var self = this;
        this.formsCounter = -1;
        this.totalCounter = 0;

        LoadingView.prototype.initialize.call(this);

        this.listenTo(App.collections.forms, 'sync', this.formFetch);

        this.listenTo(App.collections.forms, 'error', function(collection, msg, options) {
            if (collection instanceof Backbone.Collection) {
                self.updateProgress(100);
                self.updateMessage("<p>Your forms couldn't be synced.</p> <p>Please try again later<p>");
                self.addError();

                setTimeout(function() {
                    self.hide();
                    self.removeError();
                    App.views.header.showHome();
                }, 2000);
            }
        });
    },

    formFetch: function(collection, options) {
        var self = this;

        // Ignore initial reset
        if (App.collections.forms.models.length > 0) {
            self.updateLoadedCount();

            _(App.collections.forms.models).forEach(function(model) {
                if (!model.get('fh_full_data_loaded')) {
                    model.on('change:fh_full_data_loaded', self.modelLoaded, self);
                    model.on('error', self.modelLoadError, self);
                } else {
                    self.modelLoaded(model);
                }
            });
        } else {
            this.checkTotal();
        }
    },

    updateLoadedCount: function() {
        this.formsCounter += 1;
        this.updateMessage("Loading Form " + this.formsCounter + " of " + App.collections.forms.models.length);
    },

    modelLoaded: function(a, b, c) {
        this.percent += 100 / App.collections.forms.length;
        if (this.percent > 100) this.percent = 100;
        this.updateLoadedCount();
        this.totalCounter += 1;
        this.updateProgress(this.percent);
        this.checkTotal();
    },

    modelLoadError: function(model, b, c) {
        model.set('fh_error_loading', true);
        this.percent += 100 / App.collections.forms.length;
        if (this.percent > 100) this.percent = 100;
        this.totalCounter += 1;
        this.updateProgress(this.percent);
        this.checkTotal();
    },

    checkTotal: function() {
        var self = this;
        // Check total loaded to see if we should hide
        if (this.totalCounter >= App.collections.forms.models.length) {
            this.updateMessage("Form sync complete");
            setTimeout(function() {
                App.views.header.showHome();
                self.hide();
            }, 1000);
        }
    },

    destroyView: function() {
        var self = this;
        App.collections.forms.forEach(function(model) {
            model.off(null, null, self);
        });
        App.collections.forms.off(null, null, this);


        LoadingView.prototype.destroyView.call(self);
    }
});
ShowFormButtonView = Backbone.View.extend({
    events: {
        'click button.show.fetched': 'show',
        'click button.show.fetch_error': 'fetch'
    },

    templates: {
        form_button: '<button class="show btn btn-primary col-xs-12 text-center <%= enabledClass %> <%= dataClass %> fh_appform_button_action"><%= name %></button>'
    },

    initialize: function() {
        _.bindAll(this, 'render', 'unrender', 'show', 'fetch');

        this.listenTo(this.model, 'change', this.render);
        this.listenTo(this.model, 'remove', this.unrender);
    },

    render: function() {
        var html;

        //If the name of the form has not been set yet, it is loading.
        var name = this.model.get("name") || "Loading...";

        var fullyLoaded = this.model.get('fh_full_data_loaded');
        var errorLoading = this.model.get('fh_error_loading');
        var enabled = fullyLoaded || !errorLoading;
        html = _.template(this.templates.form_button)({
            name: name,
            enabledClass: enabled ? 'button-main' : '',
            dataClass: errorLoading ? 'fetch_error' : fullyLoaded ? 'fetched' : 'fetching'
        });

        this.$el.html(html);
        this.$el.find('button').not('.fh_full_data_loaded');

        return this;
    },

    unrender: function() {
        $(this.$el).remove();
    },

    show: function() {
        App.views.header.hideAll();
        App.views.form = new FormView({
            "parentEl": $("#fh_appform_content"),
            "form": this.model.coreModel,
            "autoShow": true
        });

    },

    fetch: function() {
        // show loading view
        var loadingView = new LoadingView(this.model);
        loadingView.show('Syncing form');
        this.model.fetch();
    }
});

$fh.ready({}, function() {
    FormView = $fh.forms.backbone.FormView.extend({
        initialize: function(params) {
            var self = this;
            params = params || {};
            params.fromRemote = false;
            params.rawMode = true;
            self.options = params;
            $fh.forms.backbone.FormView.prototype.initialize.call(this, params);

            if (params.form) {
                params.formId = params.form.getFormId();
            }

            this.loadForm(params, function() {
                self.trigger("loaded");
                if (params.autoShow) {
                    self.$el.show();
                }
                self.render();
            });
        },
        saveToDraft: function() {
          var self = this;
            AlertView.showAlert("Saving Draft", "info", 1000);
            $fh.forms.backbone.FormView.prototype.saveToDraft.apply(this, [
                function(err) {
                    if(err){
                        AlertView.showAlert("Error Saving Draft.", "error", 1000);
                    } else {
                        refreshSubmissionCollections();
                        self.submission.on("validationerror", self.onValidateError);
                        AlertView.showAlert("Draft Saved", "success", 1000);
                    }
                }
            ]);
        },
        submit: function() {

            AlertView.showAlert("Processing Submission", "info", 1000);

            $fh.forms.backbone.FormView.prototype.submit.apply(this, [

                function(err) {
                    if (err) {
                        console.log(err);
                        AlertView.showAlert("Submission Error", "error", 1000);
                    } else {
                        refreshSubmissionCollections();
                        App.views.header.showHome(true);
                        App.views.form = null;
                        AlertView.showAlert("Adding To Upload Queue", "info", 1000);
                    }
                }
            ]);
        }
    });
});

SubmissionListview = Backbone.View.extend({

  groupSubmissionsByForm: function(submissions){
      //Sorting by formname
      //Already sorted by

      submissions = submissions || [];

      var filteredSubmissions = {};

      _.each(submissions, function(submission){
        var submissionFormName = submission.get('formId');
        if(!filteredSubmissions[submissionFormName]){
          filteredSubmissions[submissionFormName] = [];  
        } 

        filteredSubmissions[submissionFormName].push(submission);
      });

      return filteredSubmissions;
  },
  renderGroup: function(collection){
    var self = this;
    

    var groupedSubmissions = self.groupSubmissionsByForm(collection.models);
    var groupHtml = "";

    if(collection.models.length > 0){
      _.each(groupedSubmissions, function(models, formId){
          var formName = models[0].get('formName');
          var status = collection.status;
          if(status instanceof(Array)){
            status = status[0];
          }
          var group = _.template($('#draft-list-group').html())( {
            formName: formName,
            formId: formId,
            type: status
          });
          group = $(group);

          group.find('.panel-heading').click(function(e){
            console.log(e);

            var formId = $(e.currentTarget).data().formid;
            var type = $(e.currentTarget).data().type;
            $('#drafts-list-panel-' + type + '-' + formId).slideToggle();
            $('#fh_appform_drafts-list-panel-' + type + '-' + formId + '-body-icon').toggleClass('icon-chevron-sign-up');
            $('#fh_appform_drafts-list-panel-' + type + '-' + formId + '-body-icon').toggleClass('icon-chevron-sign-down');
          });

          self.$el.append(group);
          _.each(models, function(model){
              self.appendFunction(model, formId);    
          });
      });  
    } else {
      self.$el.append('<h2 class="text-center col-xs-12">No Submissions</h2>');
    }

    return self;
  },
  appendItemView: function(form, formId, ItemView){
    var view = new ItemView({
        model: form
    });
    $('#drafts-list-group-' + formId, this.$el).append(view.render().$el);
  }
});
var FormListView = Backbone.View.extend({
    el: $('#fh_content_form_list'),

    events: {
        'click .settings': 'showSettings',
        'click button.reload': 'reload'
    },

    templates: {
        list: '<div id="fh_appform_form_list" class="col-xs-12"></div>',
        header: '<h4 class="col-xs-12 text-center">Choose a form.</h4>',
        error: '<button class="reload btn col-xs-12 fh_appform_button_cancel <%= enabledClass %> <%= dataClass %>"><%= name %><div class="loading"></div></button>'
    },

    initialize: function() {
        _.bindAll(this, 'render', 'appendForm');
        this.views = [];

        this.listenTo(App.collections.forms, 'reset', function(collection, options) {
            if (options == null || !options.noFetch) {
                App.collections.forms.each(function(form) {
                    form.fetch();
                });
            }
        });
    },

    reload: function() {
        var loadingView = new LoadingCollectionView();
        loadingView.show("Attempting to reload forms");
        App.router.reload();
    },

    show: function() {
        App.views.header.markActive('header_forms', "Forms");
        this.render();
        $(this.$el).show();
        App.resumeFetchAllowed = true;
    },

    hide: function() {
      App.resumeFetchAllowed = false;
      $(this.$el).hide();
    },

    renderErrorHandler: function(msg) {
        try {
            if (msg == null || msg.match("error_ajaxfail")) {
                msg = "An unexpected error occurred.";
            }
        } catch (e) {
            msg = "An unexpected error occurred.";
        }
        var html = _.template(this.templates.error)( {
            name: msg + "<br/>Please Retry Later",
            enabledClass: 'button-danger fh_appform_button_cancel',
            dataClass: 'fetched'
        });
        this.$el.append(html);
    },

    render: function() {
        // Empty our existing view
        $(this.$el).empty();


        //Append Logo
        $(this.$el).append(_.template($('#forms-logo').html())());
        // Add list
        $(this.$el).append(this.templates.list);

        if (App.collections.forms.models.length) {
            // Add header
            $('#fh_appform_form_list', this.$el).append(this.templates.header);
            _(App.collections.forms.models).forEach(function(form) {
                this.appendForm(form);
            }, this);
        } else if (App.collections.forms.models.length === 0) {
            this.renderErrorHandler("No forms exist for this app.");
        } else {
            this.renderErrorHandler(arguments[1]);
        }
    },

    appendForm: function(form) {
        var view = new ShowFormButtonView({
            model: form
        });
        this.views.push(view);
        $('#fh_appform_form_list', this.$el).append(view.render().$el);
    },

    showSettings: function() {
        App.views.header.showSettings();
    },

    showAbout: function() {
        App.views.header.showAbout();
    }
});

SentListView = SubmissionListview.extend({
    el: $('#fh_content_sent'),

    events: {
        
    },

    templates: {
        dismiss_all: '<button class="col-xs-12 btn btn-danger fh_appform_button_cancel dismiss-all button button-main button-block">Dismiss All</button>',
        save_max: '<label for="sentSaveMax" class="col-xs-6 fh_appform_field_title">Number of sent items to keep</label><select class="fh_appform_field_input form-control col-xs-6" id="sentSaveMax"><%= options%></select>'
    },

    initialize: function() {
        _.bindAll(this, 'render', 'changed');

        this.listenTo(App.collections.sent, 'add remove reset sync',  this.changed);

        this.render();
    },
    render: function() {

        // Empty our existing view
        $(this.$el).empty();

        //Append Logo
        $(this.$el).append(_.template($('#forms-logo').html())());
        return this;
    },

    show: function() {
        App.views.header.markActive('header_sent', "Sent");
        this.changed();
        $(this.$el).show();
    },

    

    hide: function() {
        $(this.$el).hide();
    },

    changed: function() {
        var self = this;

        // Empty our existing view
        $(this.$el).empty();

        $(this.$el).append(_.template($('#forms-logo').html())());

        self.renderGroup(App.collections.sent);
    },
    appendFunction: function(form, formId) {
        this.appendItemView(form, formId, PendingSubmittedItemView);
    }
});
DraftListView = SubmissionListview.extend({
    el: $('#fh_content_drafts'),

    templates: {
    },

    initialize: function() {
        _.bindAll(this, 'render', 'changed');

        this.listenTo(App.collections.drafts, 'add remove reset sync', this.changed);

        this.render();
    },
    render: function(){
        // Empty our existing view
        $(this.$el).empty();
        //Append Logo
        $(this.$el).append(_.template($('#forms-logo').html())());
    },

    show: function() {
        App.views.header.markActive('header_drafts', "Drafts");
        $(this.$el).show();
    },

    hide: function() {
        $(this.$el).hide();
    },

    changed: function() {
        var self = this;

        // Empty our existing view
        $(this.$el).empty();

        //Append Logo
        $(this.$el).append(_.template($('#forms-logo').html()));

        self.renderGroup(App.collections.drafts);
    },

    appendFunction: function(form, formId) {
        this.appendItemView(form, formId, DraftItemView);
    }
});
$(function() {
    SettingsView = $fh.forms.backbone.ConfigView.extend({
        el: $('#fh_content_settings'),
        events: {
            "click #cancelBtn": "cancel",
            "click #saveBtn": "save",
            "click #_refreshFormsButton": "refreshForms",
            'click button.dismiss-all': 'dismissAll',
            "change #sentSaveMax": "saveMaxSelected"
        },
        templates: {
            save_max_option: '<option value="<%= value%>"><%= value%></option>'
        },
        saveMaxSelected: function() {
            var self = this;
            var saveMax = parseInt($('#sentSaveMax', this.$el).val(), 10);

            if (_.isNumber(saveMax)) {
                $fh.forms.config.set("max_sent_saved", saveMax);
                $fh.forms.config.saveConfig();
                App.collections.sent.clearSentSubmissions(function(err) {
                    console.log("Submissions cleared", err);
                });
            }
        },
        dismissAll: function(e) {
            var self = this;
            e.stopPropagation();

            AlertView.confirm({
                message: "Are you sure you want to dismiss all sent submissions?"
            }, function(confirmDismiss){
                if (confirmDismiss) {

                    var loadingView = new LoadingCollectionView();

                    loadingView.show("Removing All Submissions", 10);
                    var all = [];

                    _(App.collections.sent.models).forEach(function(model) {
                        all.push(model);
                    });

                    var increment = 90 / (all.length ? all.length : 1);
                    var incrIndex = 0;

                    async.forEachSeries(all, function(model, cb) {
                        model.deleteSubmission(function(err) {
                            if (err) {
                                console.error("Error deleting submission: ", err);
                            }
                            incrIndex += 1;
                            console.log("Submission Deleted", model);
                            model.destroy();

                            loadingView.show("Removing Submission " + incrIndex + " of " + all.length, 10 + incrIndex * increment);

                            cb();
                        });
                    }, function(err) {
                        if (err) {
                            console.log(err);
                        }

                        loadingView.show("All Submissions Removed", 100);
                        loadingView.hide();
                    });
                }
            });

            return false;
        },
        refreshForms: function() {
            var loadingView = new LoadingCollectionView();
            loadingView.show("Reloading Content.", 10);
            $fh.forms.getTheme({
                "fromRemote": true,
                "css": true
            }, function(err, themeCSS) {
                if (err) {
                    $fh.forms.log.e("Error Loading Theme, ", err);
                } else {
                    if ($('#fh_appform_style').length > 0) {
                        $('#fh_appform_style').html(themeCSS);
                    } else {
                        $('head').append('<style id="fh_appform_style">' + themeCSS + '</style>');
                    }
                }

                loadingView.show("Theme Loaded. Now Loading Config", 30);

                $fh.forms.config.refresh(function(err) {
                    if (err) {
                        console.log("Error Loading Config");
                    }

                    loadingView.show("Config Loaded. Now Loading Forms", 40);

                    App.collections.forms.fetch();
                });
            });

        },
        renderSentOptions: function(){
            var self = this;
            var defaultOptions = [5, 10, 20, 30, 40, 50, 60, 70, 80, 100];

            var configOptions = $fh.forms.config.get("sent_items_to_keep_list") || defaultOptions;

            if(configOptions.length === 0){
              configOptions = defaultOptions;
            }


            var empty = false;

            configOptions = _.map(configOptions, function(sentItem) {
                return _.template(self.templates.save_max_option)( {
                    value: sentItem
                });
            });

            var optionsHtml = _.template($('#draft-list-option').html())( {
                label: '<label for="sentSaveMax" class="fh_appform_field_title col-xs-12">Number of sent items to keep</label>',
                inputHtml: '<select class="fh_appform_field_input form-control col-xs-12" id="sentSaveMax">' + configOptions + '</select>'
            });
            
            optionsHtml += _.template($('#draft-list-option').html())( {
                label: '',
                inputHtml: '<button class="col-xs-12 btn btn-danger fh_appform_button_cancel dismiss-all button button-main button-block">Dismiss All</button>'
            });

            this.$el.find('#misc-settings-body').append(optionsHtml);
        },
        render: function() {
            SettingsView.__super__.render.apply(this);
        
            this.renderSentOptions();

            App.views.header.markActive('header_settings', "Settings");

            if ($fh.forms.config.editAllowed()) {
                this.$el.append(_.template($('#config-buttons').html())());
            }
            return this;
        },
        populate: function() {
            // Re-render save
            var maxSize = $fh.forms.config.get("max_sent_saved") ? $fh.forms.config.get("max_sent_saved") : $fh.forms.config.get("sent_save_min");
            $('#sentSaveMax', this.$el).val(maxSize);
        },
        show: function() {
            App.views.header.hideAll();
            this.render();
            this.populate();
            this.$el.show();
        },

        hide: function() {
            this.$el.hide();
        },
        save: function() {
            SettingsView.__super__.save.call(this, function() {
                App.views.header.showHome();
            });

        },
        cancel: function() {
            App.views.header.showHome();
        }
    });
});
ItemView = Backbone.View.extend({
    className: 'list-group-item fh_appform_field_area col-xs-12',
    events: {
        'click button.delete-item': 'delete',
        'click button.submit-item': 'submit',
        'click button.group-detail': 'show'
    },

    templates: {
    },

    errorTypes: {
        "validation": "Validation Error. Please review for details.",
        "offline": "Offline during submission. Ok to resubmit",
        "network": "Network issue during submission. Ok to resubmit",
        "timeout": "Form Submission timeout. Please try again later",
        "defaults": "Unknown Error. Please review for details"
    },

    initialize: function() {
        _.bindAll(this, 'render', 'unrender', 'show', 'delete', 'submit');
        this.listenTo(this.model, 'change', this.render);
        this.listenTo(this.model, 'remove', this.unrender);
    },

    renderId: function() {
        if (this.model.get("Entry") && this.model.get("Entry").EntryId) {
            return "App Forms Id : " + this.model.get("Entry").EntryId;
        }
        if (this.model.idValue) {
            return this.model.idValue;
        }
        if (this.model.id) {
            return this.model.id.split(/-/)[0];
        }
        return "new";
    },

    generateButtonHtml: function(buttonSections){
        var buttonHtml = "";
        for(var buttonDetail in buttonSections){
            buttonHtml += _.template($('#draft-list-item-button').html())( 
                buttonSections[buttonDetail]   
            ); 
        }
        return buttonHtml;
    },

    render: function() {
        var time = new moment(this.model.get('savedAt')).format('HH:mm:ss DD/MM/YYYY');
        var error = this.model.get('error');
        var template = "#" + "draft-list-item";

        var buttons = _.template($('#draft-list-item-buttons').html())( {
            buttons: this.getButtons(),
            id: this.getIdText()
        });

        buttons = this.getButtons() === false ? false: buttons;

        var item = _.template($(template).html())( {
            name: this.model.get('formName'),
            id: this.getIdText(),
            timestamp: this.getItemTime(),
            error_type: (error && error.type) ? error.type : null,
            error_message: (error && error.type && this.errorTypes[error.type]) ? this.errorTypes[error.type] : this.errorTypes.defaults,
            buttons: buttons,
            type: this.getType()
        });

        $(this.$el).html(item);
        return this;
    },

    deleteSubmission: function(cb){
        var self = this;

        self.model.deleteSubmission(function(err){
            self.model.destroy();
            if(cb){
                return cb();
            }
        });
    },

    delete: function(e) {
        var self = this;
        e.stopPropagation();

        AlertView.confirm({
            message: "Are you sure you want to delete this submission?"
        }, function(confirmDelete){
            if (confirmDelete) {
                AlertView.showAlert("Deleting Submission", "info", 1000);
                self.deleteSubmission(function(err){
                    if(err){
                        AlertView.showAlert("Error deleting submission.", "warning", 1000);
                    } else {
                        AlertView.showAlert("Submission Deleted.", "info", 1000);
                    }
                });
            }
        });
    },
    submit: function(e) {
        var self = this;
        var model = self.model;
        e.stopPropagation();

        self.model.loadSubmission(self.model.submissionMeta, function(err) {
            if (err) {
                $fh.forms.log.e("Error Loading Submission: ", err);
            } else {
                model.coreModel.upload(function(err) {
                    if (err) {
                        $fh.forms.log.e("Error Calling Upload Submission: ", err);
                    }
                    return false;
                });
            }
        });
    },

    unrender: function() {
        $(this.$el).remove();
    },

    show: function() {
        if (this.model.load) {
            this.model.load(function(err, actual) {
                var draft = new DraftModel(actual.toJSON());
                App.views.form = new DraftView({
                    model: draft
                });
                App.views.form.render();
            });
        }
    }
});
DraftItemView = ItemView.extend({

    templates: {
        item: '<td><%= name %></td> <td><%= id %></td> <td><%= timestamp %></td><td><button class="fh_appform_button_cancel button button-negative delete-item second_button btn btn-danger">Delete</button></td>'

    },

    show: function() {
        var self = this;
        App.views.header.hideAll();

        self.model.loadSubmission(self.model.submissionMeta, function(err) {
            if (err) {
                $fh.forms.log.e("Error loading submission ", err);
            }
            var submission = self.model.coreModel;
            App.views.form = new FormView({
                "parentEl": $("#fh_appform_content"),
                "formId": submission.get("formId"),
                "autoShow": true,
                "submission": submission
            });
        });
    },
    getItemTime: function() {
        return "Saved At: <br/>" + moment(this.model.get("_localLastUpdate")).calendar();
    },
    getIdText: function() {
        return this.model.get("_ludid");
    },
    getType: function(){
        return "draft";
    },
    getButtons : function(){
        var draftButtons = [
            {
                itemText: "Clear",
                itemClass: "delete-item fh_appform_button_cancel"
            },
            {
                itemText: "Edit",
                itemClass: "group-detail fh_appform_button_action"
            }
        ];

        return this.generateButtonHtml(draftButtons);
    }
});
PendingReviewItemView = ItemView.extend({
    templates: {
    },
    errorTypes: {
        "validation": "Validation Error. Please review for details.",
        "offline": "Offline during submission. Ok to resubmit",
        "network": "Network issue during submission. Ok to resubmit",
        "timeout": "Form Submission timeout. Please try again later",
        "defaults": "Unknown Error. Please review for details"
    },
    getIdText: function() {
        return "FormId: " + this.model.get("formId");
    },
    getItemTime: function() {
        return "Submitted At: <br/>" + moment(this.model.get("submitDate")).calendar();
    },
    getType: function(){
        return "review";
    },
    show: function() {
        var self = this;
        App.views.header.hideAll();

        self.model.loadSubmission(self.model.submissionMeta, function(err) {
            if (err) {
                $fh.forms.log.e("Error loading submission ", err);
            }
            var submission = self.model.coreModel;
            App.views.form = new FormView({
                "parentEl": $("#fh_appform_content"),
                "formId": submission.get("formId"),
                "autoShow": true,
                "submission": submission
            });
        });
    },
    getButtons : function(){
        var draftButtons = [
            {
                itemText: "Clear",
                itemClass: "delete-item fh_appform_button_cancel"
            },
            {
                itemText: "Edit",
                itemClass: "group-detail fh_appform_button_action"
            }
        ];

        return this.generateButtonHtml(draftButtons);
    }
});
PendingWaitingView = ItemView.extend({
    templates: {
    },
    getIdText: function() {
        return "FormId: " + this.model.get("formId");
    },
    getItemTime: function() {
        return "Submitted: <br/>" + (new moment(this.model.get("submitDate")).format('HH:mm:ss DD/MM/YYYY'));  
    },
    show: function() {
        var self = this;
        App.views.header.hideAll();

        self.model.loadSubmission(self.model.submissionMeta, function(err) {
            if (err) {
                $fh.forms.log.e("Error loading submission ", err);
            }

            var submission = self.model.coreModel;

            submission.changeStatus("draft", function(){
                    App.views.form = new FormView({
                    "parentEl": $("#fh_appform_content"),
                    "formId": submission.get("formId"),
                    "autoShow": true,
                    "submission": submission,
                    readOnly: false
                });    
            });
        });
    },
    getButtons : function(){
        var draftButtons = [
            {
                itemText: "Edit",
                itemClass: "group-detail fh_appform_button_action"
            },
            {
                itemText: "Clear",
                itemClass: "delete-item fh_appform_button_cancel"
            },
            {
                itemText: "Submit",
                itemClass: "submit-item fh_appform_button_action"
            }
        ];

        return this.generateButtonHtml(draftButtons);
    },
    getType: function(){
        return "Pending";
    }
});
PendingSubmittingItemView = ItemView.extend({
    templates: {
    },
    getIdText: function(){
        return this.model.get("_ludid");  
    },
    getItemTime: function(){
        return "Uploaded Started At: <br/>" + (new moment(this.model.get('uploadStartDate')).format('HH:mm:ss DD/MM/YYYY'));  
    },
    getButtons : function(){
        return false;
    },
    getType: function(){
        return "Queued";
    }
});
PendingSubmittedItemView = ItemView.extend({
    templates: {
    },

    show: function() {
        var self = this;
        App.views.header.hideAll();

        self.model.loadSubmission(self.model.submissionMeta, function(err) {
            if (err) {
                $fh.forms.log.e("Error loading submission ", err);
            }
            var submission = self.model.coreModel;
            App.views.form = new FormView({
                parentEl: $("#fh_appform_content"),
                formId: submission.get("formId"),
                autoShow: true,
                submission: submission,
                readOnly: true
            });
        });
    },
    getType: function(){
        return "Submitted";
    },
    getIdText: function(){
        return this.model.get("formId");    
    },
    getItemTime: function(){
        return "Submission Completed At: <br/>" + (new moment(this.model.get('submittedDate')).format('HH:mm:ss DD/MM/YYYY'));    
    },
    getButtons : function(){
        var draftButtons = [
            {
                itemText: "Clear",
                itemClass: "delete-item fh_appform_button_cancel"
            },
            {
                itemText: "View Submission",
                itemClass: "group-detail fh_appform_button_action"
            }
        ];

        return this.generateButtonHtml(draftButtons);
    }

});
PendingListView = SubmissionListview.extend({
    el: $('#fh_content_pending'),

    events: {
        'click button.submit-all': 'submitAll'
    },

    templates: {
    },

    initialize: function() {
        _.bindAll(this, 'render', 'changed');

        this.listenTo(App.collections.pending_submitting, 'change add remove reset sync', this.changed);
        this.listenTo(App.collections.pending_review, 'change add remove reset sync', this.changed);
        this.listenTo(App.collections.pending_waiting, 'change add remove reset sync', this.changed);

        this.render();
    },
    render: function(){

        // Empty our existing view
        $(this.$el).empty();

        //Append Logo
        $(this.$el).append(_.template($('#forms-logo').html())());
    },

    scrollToTop: function() {
        window.scrollTo(0, 0);
    },
    updateSubmissionProgress: function(progress, subLocalId) {
        console.log("PROGRESS", progress, subLocalId);
        var progPercentage = 0;

        if (progress && subLocalId) {

            if(progress.formJSON){
                progPercentage = 15;   
            }

            if (progress.totalSize && progress.totalSize > 0) {
                if (progress.uploaded > 0) {
                    progPercentage += ((progress.uploaded / progress.totalSize) * 85);
                }
            }
        }

        if (subLocalId && typeof subLocalId === 'string') {
            var eleToUpdate = $('#progress-' + subLocalId);
            if (eleToUpdate && eleToUpdate.length > 0) {
                eleToUpdate = $(eleToUpdate[0]);
                if(progPercentage === 100){
                    eleToUpdate.addClass('progress-bar-success');
                }
                eleToUpdate.css("width", progPercentage + "%");
                eleToUpdate.html('<span class="sr-only">' + progPercentage + '% Complete</span>');
            }
        }
    },

    submitAll: function() {
        var self = this;
        this.scrollToTop();
        var loadingView = new LoadingCollectionView();
        loadingView.show("Queueing Pending Forms For Upload", 10);
        var c = 1;
        var tasks = _.collect(App.collections.pending_waiting.models, function(model) {
            return function(callback) {
                model.loadSubmission(model.submissionMeta, function(err){
                    model.coreModel.upload(callback);    
                });
            };
        }); // Kick things off by fetching when all stores are initialised

        async.series(tasks, function(err) {
            console.log("Submissions Queued", err);
            loadingView.show("Queueing Submissions Complete", 100);
            loadingView.hide();  
        });
        return false;
    },

    show: function() {
        App.views.header.markActive('header_pending', "Pending");
        $(this.$el).show();
    },

    hide: function() {
        $(this.$el).hide();
    },

    changed: function() {
        var self = this;

        // Empty our existing view
        $(this.$el).empty();

        //Append Logo
        $(this.$el).append(_.template($('#forms-logo').html())( {}));

        var empty = App.collections.pending_waiting.models.length === 0;

        var optionsHtml = "";

        if(App.collections.pending_waiting.models.length > 0){
            optionsHtml = _.template($("#pending-list-options").html())( {}); 
        }

        var optionsTemplate = _.template($("#draft-list-options").html())( {
            optionsHtml: optionsHtml,
            hideOptions: empty,
            type: "pending"   
        });

        this.$el.append(optionsTemplate);

        this.$el.find('.panel-heading').click(function(e){
            console.log(e);

            var type = $(e.currentTarget).data().type;
            $('#submission-options-' + type).slideToggle();
            $('#fh_appform_submission-options-' + type + '-body-icon').toggleClass('icon-chevron-sign-up');
            $('#fh_appform_submission-options-' + type + '-body-icon').toggleClass('icon-chevron-sign-down');
        });

        self.renderGroup(App.collections.pending_waiting);
    },
    appendFunction: function(form, formId) {
        this.appendItemView(form, formId, PendingWaitingView);
    }
});
QueuedListView = SubmissionListview.extend({
    el: $('#fh_content_queued'),

    events: {
    },

    templates: {
    },

    initialize: function() {
        _.bindAll(this, 'render', 'changed');

        this.listenTo(App.collections.pending_submitting, 'change add remove reset sync', this.changed);
        
        this.render();
    },
    render: function(){

        // Empty our existing view
        $(this.$el).empty();

        //Append Logo
        $(this.$el).append(_.template($('#forms-logo').html())());
    },

    scrollToTop: function() {
        window.scrollTo(0, 0);
    },
    updateSubmissionProgress: function(progress, subLocalId) {
        console.log("PROGRESS", progress, subLocalId);
        var progPercentage = 0;

        if (progress && subLocalId) {

            if(progress.formJSON){
                progPercentage = 15;   
            }

            if (progress.totalSize && progress.totalSize > 0) {
                if (progress.uploaded > 0) {
                    progPercentage += ((progress.uploaded / progress.totalSize) * 85);
                }
            }
        }

        if (subLocalId && typeof subLocalId === 'string') {
            var eleToUpdate = $('#progress-' + subLocalId);
            console.log("ELE ", eleToUpdate);
            if (eleToUpdate && eleToUpdate.length > 0) {
                eleToUpdate = $(eleToUpdate[0]);
                if(progPercentage === 100){
                    eleToUpdate.addClass('progress-bar-success');
                }
                eleToUpdate.css("width", progPercentage + "%");
                eleToUpdate.html('<span class="sr-only">' + progPercentage + '% Complete</span>');
            }
        }
    },

    hide: function() {
        $(this.$el).hide();
    },
    show: function() {
        App.views.header.markActive('header_queued', "Uploading");
        $(this.$el).show();
    },

    changed: function() {
        var self = this;

        // Empty our existing view
        $(this.$el).empty();

        //Append Logo
        $(this.$el).append(_.template($('#forms-logo').html(), {}));

        var empty = App.collections.pending_submitting.models.length === 0;


        self.renderGroup(App.collections.pending_submitting);
    },
    appendFunction: function(form, formId) {
        this.appendItemView(form, formId, PendingSubmittingItemView);
    }
});
ReviewListView = SubmissionListview.extend({
    el: $('#fh_content_review'),

    events: {
    },

    templates: {
    },

    initialize: function() {
        _.bindAll(this, 'render', 'changed');

        this.listenTo(App.collections.pending_review, 'change add remove reset sync', this.changed);

        this.render();
    },
    render: function(){

        // Empty our existing view
        $(this.$el).empty();

        //Append Logo
        $(this.$el).append(_.template($('#forms-logo').html())());
    },

    scrollToTop: function() {
        window.scrollTo(0, 0);
    },

    hide: function() {
        $(this.$el).hide();
    },

    show: function() {
        App.views.header.markActive('header_review', "Review");
        $(this.$el).show();
    },

    changed: function() {
        var self = this;

        // Empty our existing view
        $(this.$el).empty();

        //Append Logo
        $(this.$el).append(_.template($('#forms-logo').html())( {}));

        var empty = App.collections.pending_review.models.length === 0;

        self.renderGroup(App.collections.pending_review);
    },
    appendFunction: function(form, formId) {
        this.appendItemView(form, formId, PendingReviewItemView);
    }
});
HeaderView = Backbone.View.extend({
    el: '#fh_appform_header',

    events: {},

    initialize: function() {
        var self = this;
        this.undelegateEvents();
        _.bindAll(this, 'render', 'advise', 'adviseAll', 'showHome', 'showDrafts', 'showPending', 'updateCounts');
        this.initialising = false;

        this.listenTo(App.collections.drafts, 'add remove reset', this.updateCounts);
        this.listenTo(App.collections.pending_submitting, 'add remove reset', this.updateCounts);
        this.listenTo(App.collections.pending_review, 'add remove reset', this.updateCounts);
        this.listenTo(App.collections.pending_waiting, 'add remove reset', this.updateCounts);
        this.listenTo(App.collections.sent, 'add remove reset', this.updateCounts);  
        
        this.adviseAll();
        this.render();
    },

    render: function() {
        var self = this;
        $(this.$el).empty();

        var header = $(_.template($('#header-list').html(), {})());

        $(this.$el).append(header);

        $('.header_drafts').click(function(e) {
            self.showDrafts();
        });

        $('.header_forms').click(function(e) {
            self.showHome();
        });

        $('.header_pending').click(function(e) {
            self.showPending();
        });

        $('.header_queued').click(function(e) {
            self.showQueued();
        });

        $('.header_review').click(function(e) {
            self.showReview();
        });

        $('.header_sent').click(function(e) {
            self.showSent();
        });

        $('.header_settings').click(function(e) {
            self.showSettings();
        });

        $('#fh_appform_header_toggle_button').click(function(e) {
            $('.row-offcanvas').toggleClass('active');
            $('#fh_appform_header').toggleClass('active');
        });

        $(document).click(function(e) {
            if (!$(e.target).hasClass('navbar-toggle') && !$(e.target).hasClass('icon-bar')) {
                self.hideMenu();
            }
        });

        $(this.$el).show();
    },
    adviseAll: function() {
        this.showHome = this.advise(this.showHome);
        this.showDrafts = this.advise(this.showDrafts);
        this.showPending = this.advise(this.showPending);
        this.showQueued = this.advise(this.showQueued);
        this.showReview = this.advise(this.showReview);
        this.showSent = this.advise(this.showSent);
        this.showSettings = this.advise(this.showSettings);
    },
    advise: function(func) {
        var self = this;
        return function() {
            var skip = false;
            var args = arguments;
            if (args.length && args[0] === true) {
                skip = true;
            }
            var proceed = function(clear) {
                try {
                    return func.call(self, args);
                } finally {
                    if (clear && App.views.form) {
                        App.views.form = null;
                    }
                }
            };
            if (skip || App.views.form == null || App.views.form.readonly) {
                return proceed();
            } else {

                if (App.views.form.isFormEdited()) {
                    AlertView.confirm({
                        message: 'It looks like you have unsaved data -- if you leave before submitting your changes will be lost. Continue?'
                    }, function(confirmDelete){
                        if (confirmDelete) {
                            return proceed(true);
                        } else {
                            return false;
                        }
                    });
                } else {
                    proceed(true);
                }
            }
        };
    },

    hideMenu: function() {
        console.log("hideMenu");
        $('.row-offcanvas').removeClass('active');
        $('#fh_appform_header').removeClass('active');
        this.updateCounts();
    },

    showHome: function(e) {
        console.log("showHome");
        this.hideMenu();

        this.hideAll();
        App.views.form_list.show();
        return false;
    },

    showDrafts: function(e) {
        this.hideMenu();
        this.hideAll();
        App.views.drafts_list.show();
        return false;
    },

    showPending: function(e) {
        this.hideMenu();
        this.hideAll();
        App.views.pending_list.show();
        return false;
    },

    showQueued: function(e) {
        this.hideMenu();
        this.hideAll();
        App.views.queued_list.show();
        return false;
    },

    showReview: function(e) {
        this.hideMenu();
        this.hideAll();
        App.views.review_list.show();
        return false;
    },

    showSent: function(e) {
        this.hideMenu();
        this.hideAll();
        App.views.sent_list.show();
        return false;
    },

    showSettings: function(e) {
        this.hideMenu();
        this.hideAll();
        App.views.settings.show();
        return false;
    },
    hideAll: function() {
        App.views.form_list.hide();
        App.views.drafts_list.hide();
        App.views.pending_list.hide();
        App.views.queued_list.hide();
        App.views.review_list.hide();
        App.views.sent_list.hide();
        App.views.settings.hide();
        $('#fh_appform_content').hide();
        if (_.isObject(App.views.form)) {
            App.views.form.$el.empty();
            App.views.form = null;
        }
    },

    markActive: function(tab_class, headerText) {
        var self = this;
        tab_class = tab_class ? tab_class : "";
        tab_class = "." + tab_class;
        $('.nav.navbar-nav li').removeClass('active');
        $(tab_class).addClass('active');

        var appName = "App Forms";

        if ($fh.app_props.apptitle) {
            appName = $fh.app_props.apptitle;
        }

        if (headerText) {
            $('.navbar-header .navbar-brand').html("<div class='fh_appform_header_name'>" + appName + "</div><div class='fh_appform_header_section'> " + headerText + "</div>");
        }
    },

    updateCounts: function() {

        var forms_count = App.collections.forms.length;
        if (forms_count > 0) {
            $('#header_forms .badge').text(forms_count).show();
        } else {
            $('#header_forms .badge').hide();
        }

        var drafts_count = App.collections.drafts.length;
        if (drafts_count > 0) {
            $('#header_drafts .badge').text(drafts_count).show();
        } else {
            $('#header_drafts .badge').hide();
        }

        var pending_waiting_count = App.collections.pending_waiting.length;

        if (pending_waiting_count > 0) {
            $('#header_pending .badge').text(pending_waiting_count).show();
        } else {
            $('#header_pending .badge').hide();
        }

        var pending_queued_count = App.collections.pending_submitting.length;

        if (pending_queued_count > 0) {
            $('#header_queued .badge').text(pending_queued_count).show();
        } else {
            $('#header_queued .badge').hide();
        }

        var pending_review_count = App.collections.pending_review.length;

        if (pending_review_count > 0) {
            $('#header_review .badge').text(pending_review_count).show();
        } else {
            $('#header_review .badge').hide();
        }

        var sent_count = App.collections.sent.length;
        if (sent_count > 0) {
            $('#header_sent .badge').text(sent_count).show();
        } else {
            $('#header_sent .badge').hide();
        }

        console.log("Update Counts: ", forms_count, drafts_count, pending_waiting_count, pending_queued_count, pending_review_count, sent_count);
    }
});
AlertView = Backbone.View.extend({
    el: $("#fh_appform_alerts_area"),
    alertClasses: {
        error: 'alert-danger',
        info: 'alert-info',
        success: 'alert-success',
        warning: 'alert-warning'
    },

    initialize: function() {},

    render: function(opts) {
        var self = this;

        opts.type = opts.type || "info";

        var alertHtml = _.template($('#alert-entry').html())( {
            alertClass: self.alertClasses[opts.type] || self.alertClasses['info'],
            alertMessage: opts.message
        });

        alertHtml = $(alertHtml);

        this.$el.append(alertHtml);

        if (typeof(opts.timeout) === "number") {
            setTimeout(function() {
                alertHtml.animate({
                    height: 0,
                    opacity: 0
                }, 'slow', function() {
                    alertHtml.remove();
                });
            }, opts.timeout);
        }

        return this;
    }
});
var alertView = new AlertView();

AlertView.showAlert = function(message, type, timeout) {
    alertView.render({
        message: message,
        type: type,
        timeout: timeout
    });
};

/**
 * Allowing the user to confirm an action
 * @param params
 * @param cb
 */
AlertView.confirm = function(params, cb){
    var message = params.message || "Confirm Action";
    if(navigator && navigator.notification && navigator.notification.confirm){
        navigator.notification.confirm(message, function(actionSelected){
            //Call back with whether the action was confirmed or not.
            return cb(actionSelected === 2);
        }, "Confirm Action", ["Cancel", "Confirm"]);
    } else {
        return cb(confirm(message));
    }
};
App.Router = Backbone.Router.extend({
    routes: {
        "form_list": "form_list",
        "*path": "form_list" // Default route
    },

    initialize: function() {
        _.bindAll(this, "form_list", "onReady", "onResume", "onConfigLoaded", "reload", "fetchCollections", "onPropsRead");
    },

    form_list: function() {
        var self = this;
        var initRetryLimit = 20;
        var initRetryAttempts = 0;
        self.loadingView = new LoadingCollectionView();
        self.deviceReady = false;
        self.initReady = false;

        function startForms() {
            self.loadingView.show("Initialising Forms", 10);
            $fh.forms.init({}, function() {
                self.loadingView.show("Fetching Theme", 15);
                $fh.forms.getTheme({
                    "fromRemote": true,
                    "css": true
                }, function(err, themeCSS) {
                    if (err) console.error(err);
                    App.views.form_list = new FormListView();
                    App.views.drafts_list = new DraftListView();
                    App.views.pending_list = new PendingListView();
                    App.views.queued_list = new QueuedListView();
                    App.views.review_list = new ReviewListView();
                    App.views.sent_list = new SentListView();
                    App.views.settings = new SettingsView();
                    App.views.header = new HeaderView();

                    if ($('#fh_appform_style').length > 0) {
                        $('#fh_appform_style').html(themeCSS);
                    } else {
                        $('head').append('<style id="fh_appform_style">' + themeCSS + '</style>');
                    }

                    $fh.forms.config.mbaasOnline(function() {
                        $fh.forms.log.d("Device online");
                        AlertView.showAlert("Working Online", "info", 1000);
                    });

                    $fh.forms.config.mbaasOffline(function() {
                        $fh.forms.log.d("Device offline");
                        AlertView.showAlert("Working Offline", "error", 1000);
                    });

                    self.onReady();
                });
            });
        }


        $("#includedContent").load("templates/templates.html");

        self.loadingView.show("App Starting", 10);
        if (window.PhoneGap || window.cordova) {
            document.addEventListener("deviceready", function() {
                self.deviceReady = true;
            }, false);
            document.addEventListener("backbutton", function() {
                $fh.forms.log.d("Back Button Clicked");
                if (App.views.form && typeof(App.views.form.backEvent) === 'function') {
                    if (App.views.form.backEvent() === false) { //Clicked back while on the first page. Should go home
                        App.views.header.showHome();
                    }
                } else {
                    App.views.header.showHome();
                }
            }, false);
        } else {
            self.deviceReady = true;
        }
        $fh.on('fhinit', function(err, cloudProps) {
            console.log("fhinit called");
            if (err) {
                console.error("Error on fhinit", err);
            }

            self.initReady = true;
        });
        var deviceReadyInterval = setInterval(function() {
            if (self.deviceReady === true && self.initReady === true) {
                startForms();
                clearInterval(deviceReadyInterval);
            } else {
                if (initRetryAttempts > initRetryLimit) {
                    console.error("Forms Not Ready Yet. Retry Attempts Exceeded");

                    if (self.deviceReady === true) {
                        console.error("Forms Not Ready Yet. Device Ready. Starting in offline mode.");
                        startForms();
                        clearInterval(deviceReadyInterval);
                    } else {
                        console.error("Forms Device Not Ready. Trying again.");
                        initRetryAttempts = 0;
                    }
                } else {
                    initRetryAttempts += 1;
                }
            }
        }, 500);
    },
    onReady: function() {
        this.loadingView.show("App Ready, Loading Form List", 20);

        $fh.env(this.onPropsRead);

        // by default, allow fetching on resume event.
        // Can be set to false when taking a pic so refetch doesn't happen on resume from that
        App.resumeFetchAllowed = true;
        document.addEventListener("resume", this.onResume, false);
        var banner = false;
        $('#fh_appform_banner .list li').each(function(i, e) {
            banner = true;
        });
        this.onConfigLoaded();
    },

    // run App.router.onResume() to test this in browser
    onResume: function() {
        // only trigger resync of forms if NOT resuming after taking a photo
        if (App.resumeFetchAllowed) {
          var loadingView = new LoadingCollectionView();
          loadingView.show("Refreshing Forms List.", 30);
          App.collections.forms.fetch({
            success: function(){
              //Fetch is finished, render the updated forms list
              loadingView.show("Finished refreshing forms list.", 100);

              loadingView.hide();
              App.views.form_list.render();
            },
            error: function(err){
              $fh.forms.log.e("Error refreshing forms list. ", err);
              AlertView.showAlert("Error refreshing forms list.", "error", 1000);
            }
          });
        }
    },
    onConfigLoaded: function() {
        this.fetchCollections("Config Loaded, Fetching Forms", 30);
    },

    reload: function() {
        App.collections.forms.reset();
        this.fetchCollections("Reloading Forms", 10);
    },

    fetchCollections: function(msg, progress) {
        this.loadingView.show(msg, progress);
        App.collections.forms.fetch();

        refreshSubmissionCollections();
    },
    onPropsRead: function(props) {
        this.props = props;
    }
});

App.router = new App.Router();

if(module && module.exports){
  module.exports = App.router;
} else {
  Backbone.history.start();
}
