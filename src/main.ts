import Aurelia from 'aurelia';
import { MyApp } from './my-app';

import { AllConfiguration } from '@aurelia-mdc-web/all';

Aurelia
  .register(AllConfiguration)
  .app(MyApp)
  .start();
