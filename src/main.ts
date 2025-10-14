import Aurelia from 'aurelia';
import { MyApp } from './my-app';
import * as value_converters from './resources/services/value_converters';

import { AllConfiguration } from '@aurelia-mdc-web/all';

Aurelia
  .register(AllConfiguration, [...Object.values(value_converters)])
  .app(MyApp)
  .start();
