import {Router} from '../router';
import * as path from 'path';
import {TagClsMetadata, TAGGED_CLS} from 'injection';
import {loading} from '../loading';
import 'reflect-metadata';
import {WEB_ROUTER_CLS, WEB_ROUTER_PREFIX_CLS, WEB_ROUTER_PROP} from '../decorators/metaKeys';
import {MidwayLoader} from 'midway-core';

const is = require('is-type-of');
// const debug = require('debug')('midway:web-loader');

export class MidwayWebLoader extends MidwayLoader {

  protected async preloadController(): Promise<void> {
    const appDir = path.join(this.options.baseDir, 'app');
    const results = loading(this.getFileExtension(['controllers/**/*', 'controller/**/*']), {
      loadDirs: appDir,
      call: false,
    });

    for (let exports of results) {
      if (is.class(exports)) {
        await this.preInitController(exports);
      } else {
        for (let m in exports) {
          const module = exports[m];
          if (is.class(module)) {
            await this.preInitController(module);
          }
        }
      }
    }
  }
  /**
   * 从xml加载controller
   */
  async preloadControllerFromXml(): Promise<void> {
    const ids = this.applicationContext.controllersIds;
    if (Array.isArray(ids) && ids.length > 0) {
      for (let i = 0; i < ids.length; i++) {
        const controllers = await this.applicationContext.getAsync(ids[i]);
        const app = this.app;
        if (Array.isArray(controllers.list)) {
          controllers.list.forEach(c => {
            let newRouter = new Router({
              sensitive: true,
              logger: this.options.logger,
            }, app);
            c.expose(newRouter);

            app.use(newRouter.middleware());
          });
        }
      }
    }
  }
  /**
   * init controller in ApplicationContext
   * @param module
   */
  private async preInitController(module): Promise<void> {
    let cid = this.getModuleIdentifier(module);
    if (cid) {
      const controller = await this.applicationContext.getAsync(cid);
      this.preRegisterRouter(module, controller);
    }
  }

  private getModuleIdentifier(module) {
    let metaData = <TagClsMetadata>Reflect.getMetadata(TAGGED_CLS, module);
    if (metaData) {
      return metaData.id;
    }
  }

  private preRegisterRouter(target, controller) {
    const app = this.app;
    const controllerPrefix = Reflect.getMetadata(WEB_ROUTER_PREFIX_CLS, target);
    if (controllerPrefix) {
      let newRouter = new Router({
        sensitive: true,
        logger: this.options.logger,
      }, app);
      newRouter.prefix(controllerPrefix);
      const methodNames = Reflect.getMetadata(WEB_ROUTER_CLS, target);
      for (let methodName of methodNames) {
        const mappingInfo = Reflect.getMetadata(WEB_ROUTER_PROP, target, methodName);
        newRouter[mappingInfo.requestMethod].call(newRouter, mappingInfo.routerName, mappingInfo.path, controller[methodName].bind(controller));
      }
      app.use(newRouter.middleware());
    }
  }

  private getFileExtension(names: string | string[]): string[] {
    if (typeof names === 'string') {
      return [names + '.ts', names + '.js', '!**/**.d.ts'];
    } else {
      let arr = [];
      names.forEach((name) => {
        arr = arr.concat([name + '.ts', name + '.js']);
      });
      return arr.concat(['!**/**.d.ts']);
    }
  }

  async refreshContext(): Promise<void> {
    // 虽然有点hack，但是将就着用吧
    if (Array.isArray(this.config.configLocations)) {
      this.applicationContext.configLocations = this.config.configLocations;
    }
    this.applicationContext.props.putObject(this.config);

    await super.refreshContext();

    await this.preloadControllerFromXml();
  }
}
