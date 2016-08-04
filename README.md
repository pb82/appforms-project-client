# FeedHenry Drag & Drop Apps Template App v3 (Minified)

## Overview

This is the minified version of the [Drag & Drop Template App](https://github.com/feedhenry/Appforms-Template-v3) app.

For development, it is recommended to use the non-minified version of the App.

## Local development

You can also use Grunt to point your App at a local developement server. To do this, use the ```grunt serve:local``` command. Some notes on using the serve:local task:

* by default, the local server development url is: http://localhost:8001
* you can change this directly in your local Gruntfile.js, in the app config:

```
  app: {
    // configurable paths
    app: 'www',
    url: '',
    default_local_server_url: 'http://localhost:8001'
  },
```

* you can also pass a 'url' optional flag to server:local, e.g. ```grunt serve:local --url=http://localhost:9000```
