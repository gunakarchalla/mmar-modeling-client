import { Logger } from 'resources/services/logger';
import { HttpClient } from '@aurelia/fetch-client';
import { newInstanceOf } from '@aurelia/kernel';
import { ICustomElementViewModel } from 'aurelia';
import { Class, Metamodel, SceneType, Attribute, Relationclass, Role, Port, AttributeType, SceneInstance, ClassInstance, RelationclassInstance, RoleInstance, PortInstance, AttributeInstance, Procedure } from '../../../../mmar-global-data-structure';
import { IHydratedController } from '@aurelia/runtime-html';
import { GlobalDefinition } from 'resources/global_definitions';

export class FetchHelper implements ICustomElementViewModel {

    public baseUrl: string = process.env.API_URL;
    protected jsonParseReviver: ((key: string, value: any) => any) | undefined = undefined;





    constructor(
        @newInstanceOf(HttpClient) readonly http: HttpClient,
        private logger: Logger,
        private globalObjectInstance: GlobalDefinition
    ) {

    }

    attached() {
    }

    setUpHttpClient() {
        this.http.configure(config =>
            config
                .withBaseUrl("")
                .withDefaults({
                    credentials: 'same-origin',
                    headers: {
                        'Accept': 'application/json',
                        'X-Requested-With': 'Fetch'
                    }
                })
                .withInterceptor({
                    request(request) {
                        if (this.logger)
                            this.logger.log(`Requesting ${request.method} ${request.url}`, 'info')
                        return request;
                    },
                    response(response) {
                        if (this.logger)
                            this.Logger.log(`Received ${response.status} ${response.url}`, 'info')
                        return response;
                    }
                })
        );
    }

    /**
     * Log in a user
     * 
     */
    loginPost(body: {}): Promise<string> {
        let url_ = this.baseUrl + "/login/signin";
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((response: Response) => {
            const status = response.status;
            let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
            if (status === 200) {
                return response.text().then((_responseText) => {
                    let result201: any = null;
                    let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                    result201 = resultData201;
                    return result201;
                });
            } else if (status !== 200 && status !== 204) {
                return response.text().then((_responseText) => {
                    return throwException("An unexpected server error occurred.", status, _responseText, _headers);
                });
            }
        });
    }


    /**
        * Get the list of all scene types
        * @return Successful operation
        */
    getSceneTypes(): Promise<Metamodel> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes";
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processGetSceneTypes(_response);
        });
    }

    protected processGetSceneTypes(response: Response): Promise<Metamodel> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Metamodel.fromJS(resultData200);
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Metamodel>(null as any);
    }

    /**
     * Create a new scene type
     * @param body Created a new scene type
     * @return Scene type created successfully
     */
    createSceneType(body: SceneType): Promise<SceneType> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes";
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processCreateSceneType(_response);
        });
    }

    protected processCreateSceneType(response: Response): Promise<SceneType> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = SceneType.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<SceneType>(null as any);
    }

    /**
     * Delete a all scene types
     * @return Scene type created successfully
     */
    deleteSceneTypes(): Promise<SceneType> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes";
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processDeleteSceneTypes(_response);
        });
    }

    protected processDeleteSceneTypes(response: Response): Promise<SceneType> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = SceneType.fromJS(resultData201);
                return result201;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<SceneType>(null as any);
    }

    /**
     * Get a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @return Successful operation
     */
    getSceneTypeById(sceneTypeUuid: string): Promise<SceneType> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processGetSceneTypeById(_response);
        });
    }

    protected processGetSceneTypeById(response: Response): Promise<SceneType> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = SceneType.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<SceneType>(null as any);
    }

    /**
     * Update a scene type
     * @param sceneTypeUuid The uuid of a scene type
     * @param body Updated scene type object
     * @return Successful operation
     */
    updateSceneType(sceneTypeUuid: string, body: SceneType): Promise<SceneType> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processUpdateSceneType(_response);
        });
    }

    protected processUpdateSceneType(response: Response): Promise<SceneType> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = SceneType.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("User not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<SceneType>(null as any);
    }

    /**
     * Delete a scene type
     * @param sceneTypeUuid The uuid of a scene type
     * @return Scene type deleted successfully
     */
    deleteSceneType(sceneTypeUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processDeleteSceneType(_response);
        });
    }

    protected processDeleteSceneType(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid id supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get all attributes of a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @return Successful operation
     */
    getAttributesOfSceneTypeById(sceneTypeUuid: string): Promise<Attribute[]> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/attributes";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processGetAttributesOfSceneTypeById(_response);
        });
    }

    protected processGetAttributesOfSceneTypeById(response: Response): Promise<Attribute[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(Attribute.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Attribute[]>(null as any);
    }

    /**
     * Add an attribute to a scene type
     * @param sceneTypeUuid The uuid of a scene type
     * @param body New attribute scene type object
     * @return Successful operation
     */
    addAttributeToSceneType(sceneTypeUuid: string, body: Attribute): Promise<Attribute> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/attributes";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAddAttributeToSceneType(_response);
        });
    }

    protected processAddAttributeToSceneType(response: Response): Promise<Attribute> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Attribute.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("User not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Attribute>(null as any);
    }

    /**
     * Delete all attributes of a scene type
     * @param sceneTypeUuid The uuid of a scene type
     * @return Attribute deleted successfully
     */
    attributesDELETE(sceneTypeUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/attributes";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesDELETE(_response);
        });
    }

    protected processAttributesDELETE(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid id supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get the list of all scene Groups
     * @return Successful operation
     */
    sceneGroupsAll(): Promise<Metamodel[]> {
        let url_ = this.baseUrl + "/metamodel/sceneGroups";
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processSceneGroupsAll(_response);
        });
    }

    protected processSceneGroupsAll(response: Response): Promise<Metamodel[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(Metamodel.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Metamodel[]>(null as any);
    }

    /**
     * Create a new scene group
     * @param body Created a new scene group
     * @return Scene type created successfully
     */
    sceneGroupsPOST(body: SceneType): Promise<SceneType> {
        let url_ = this.baseUrl + "/metamodel/sceneGroups";
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processSceneGroupsPOST(_response);
        });
    }

    protected processSceneGroupsPOST(response: Response): Promise<SceneType> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = SceneType.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<SceneType>(null as any);
    }

    /**
     * Delete a all scene groups
     * @return User created successfully
     */
    sceneGroupsDELETE(): Promise<SceneType> {
        let url_ = this.baseUrl + "/metamodel/sceneGroups";
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processSceneGroupsDELETE(_response);
        });
    }

    protected processSceneGroupsDELETE(response: Response): Promise<SceneType> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = SceneType.fromJS(resultData201);
                return result201;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<SceneType>(null as any);
    }

    /**
     * Get all classes of a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @return Successful operation
     */
    classesAll(sceneTypeUuid: string): Promise<Class[]> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/classes";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processClassesAll(_response);
        });
    }

    protected processClassesAll(response: Response): Promise<Class[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(Class.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Class[]>(null as any);
    }

    /**
     * Create a class to a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @param body Create scene type object
     * @return Successful operation
     */
    classesPOST(sceneTypeUuid: string, body: Class): Promise<SceneType> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/classes";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processClassesPOST(_response);
        });
    }

    protected processClassesPOST(response: Response): Promise<SceneType> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = SceneType.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<SceneType>(null as any);
    }

    /**
     * Delete all classes of a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @return Classes type deleted successfully
     */
    classesDELETE(sceneTypeUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/classes";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processClassesDELETE(_response);
        });
    }

    protected processClassesDELETE(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid id supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get a class by uuid
     * @param classeUuid The uuid of a class
     * @return Successful operation
     */
    classesGET(classeUuid: string): Promise<Class> {
        let url_ = this.baseUrl + "/metamodel/classes/{ClasseUuid}";
        if (classeUuid === undefined || classeUuid === null)
            throw new Error("The parameter 'classeUuid' must be defined.");
        url_ = url_.replace("{ClasseUuid}", encodeURIComponent("" + classeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processClassesGET(_response);
        });
    }

    protected processClassesGET(response: Response): Promise<Class> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Class.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Class>(null as any);
    }

    /**
     * Update a class
     * @param classeUuid The uuid of a class
     * @param body Updated class object
     * @return Successful operation
     */
    classesPATCH(classeUuid: string, body: Class): Promise<Class> {
        let url_ = this.baseUrl + "/metamodel/classes/{ClasseUuid}";
        if (classeUuid === undefined || classeUuid === null)
            throw new Error("The parameter 'classeUuid' must be defined.");
        url_ = url_.replace("{ClasseUuid}", encodeURIComponent("" + classeUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processClassesPATCH(_response);
        });
    }

    protected processClassesPATCH(response: Response): Promise<Class> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Class.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("User not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Class>(null as any);
    }

    /**
     * Delete a class
     * @param classeUuid The uuid of a class
     * @return class deleted successfully
     */
    classesDELETE2(classeUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/classes/{ClasseUuid}";
        if (classeUuid === undefined || classeUuid === null)
            throw new Error("The parameter 'classeUuid' must be defined.");
        url_ = url_.replace("{ClasseUuid}", encodeURIComponent("" + classeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processClassesDELETE2(_response);
        });
    }

    protected processClassesDELETE2(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid id supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get all attributes of a class by uuid
     * @param classeUuid The uuid of a class
     * @return Successful operation
     */
    attributesAll(classeUuid: string): Promise<Attribute[]> {
        let url_ = this.baseUrl + "/metamodel/classes/{ClasseUuid}/attributes";
        if (classeUuid === undefined || classeUuid === null)
            throw new Error("The parameter 'classeUuid' must be defined.");
        url_ = url_.replace("{ClasseUuid}", encodeURIComponent("" + classeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesAll(_response);
        });
    }

    protected processAttributesAll(response: Response): Promise<Attribute[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(Attribute.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Attribute[]>(null as any);
    }

    /**
     * Add an attribute to a class
     * @param classeUuid The uuid of a class
     * @param body New attribute class object
     * @return Successful operation
     */
    attributesPOST(classeUuid: string, body: Attribute): Promise<Attribute> {
        let url_ = this.baseUrl + "/metamodel/classes/{ClasseUuid}/attributes";
        if (classeUuid === undefined || classeUuid === null)
            throw new Error("The parameter 'classeUuid' must be defined.");
        url_ = url_.replace("{ClasseUuid}", encodeURIComponent("" + classeUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesPOST(_response);
        });
    }

    protected processAttributesPOST(response: Response): Promise<Attribute> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Attribute.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("User not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Attribute>(null as any);
    }

    /**
     * Delete all attributes of a class
     * @param classeUuid The uuid of a class
     * @return Attribute deleted successfully
     */
    attributesDELETE2(classeUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/classes/{ClasseUuid}/attributes";
        if (classeUuid === undefined || classeUuid === null)
            throw new Error("The parameter 'classeUuid' must be defined.");
        url_ = url_.replace("{ClasseUuid}", encodeURIComponent("" + classeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesDELETE2(_response);
        });
    }

    protected processAttributesDELETE2(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid id supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get all decomposable classes of a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @return Successful operation
     */
    decomposableClassesAll(sceneTypeUuid: string): Promise<Class[]> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/decomposableClasses";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processDecomposableClassesAll(_response);
        });
    }

    protected processDecomposableClassesAll(response: Response): Promise<Class[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(Class.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Class[]>(null as any);
    }

    /**
     * Create a decomposable class to a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @param body Created decomposable class object
     * @return Successful operation
     */
    decomposableClassesPOST(sceneTypeUuid: string, body: Class): Promise<Class> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/decomposableClasses";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processDecomposableClassesPOST(_response);
        });
    }

    protected processDecomposableClassesPOST(response: Response): Promise<Class> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Class.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Class>(null as any);
    }

    /**
     * Delete all classes of a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @return Classes type deleted successfully
     */
    decomposableClassesDELETE(sceneTypeUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/decomposableClasses";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processDecomposableClassesDELETE(_response);
        });
    }

    protected processDecomposableClassesDELETE(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid id supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get a class by uuid
     * @param decClasseUuid The uuid of a decomposable class
     * @return Successful operation
     */
    decomposableClassesGET(decClasseUuid: string): Promise<Class> {
        let url_ = this.baseUrl + "/metamodel/decomposableClasses/{DecClasseUuid}";
        if (decClasseUuid === undefined || decClasseUuid === null)
            throw new Error("The parameter 'decClasseUuid' must be defined.");
        url_ = url_.replace("{DecClasseUuid}", encodeURIComponent("" + decClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processDecomposableClassesGET(_response);
        });
    }

    protected processDecomposableClassesGET(response: Response): Promise<Class> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Class.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Class>(null as any);
    }

    /**
     * Update a decomposable class
     * @param decClasseUuid The uuid of a decomposable class
     * @param body Updated decomposable class object
     * @return Successful operation
     */
    decomposableClassesPATCH(decClasseUuid: string, body: Class): Promise<Class> {
        let url_ = this.baseUrl + "/metamodel/decomposableClasses/{DecClasseUuid}";
        if (decClasseUuid === undefined || decClasseUuid === null)
            throw new Error("The parameter 'decClasseUuid' must be defined.");
        url_ = url_.replace("{DecClasseUuid}", encodeURIComponent("" + decClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processDecomposableClassesPATCH(_response);
        });
    }

    protected processDecomposableClassesPATCH(response: Response): Promise<Class> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Class.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("User not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Class>(null as any);
    }

    /**
     * Delete a decomposable class
     * @param decClasseUuid The uuid of a decomposable class
     * @return class deleted successfully
     */
    decomposableClassesDELETE2(decClasseUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/decomposableClasses/{DecClasseUuid}";
        if (decClasseUuid === undefined || decClasseUuid === null)
            throw new Error("The parameter 'decClasseUuid' must be defined.");
        url_ = url_.replace("{DecClasseUuid}", encodeURIComponent("" + decClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processDecomposableClassesDELETE2(_response);
        });
    }

    protected processDecomposableClassesDELETE2(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get all attributes of a decomposable class by uuid
     * @param decClasseUuid The uuid of a decomposable class
     * @return Successful operation
     */
    attributesAll2(decClasseUuid: string): Promise<Attribute[]> {
        let url_ = this.baseUrl + "/metamodel/decomposableClasses/{DecClasseUuid}/attributes";
        if (decClasseUuid === undefined || decClasseUuid === null)
            throw new Error("The parameter 'decClasseUuid' must be defined.");
        url_ = url_.replace("{DecClasseUuid}", encodeURIComponent("" + decClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesAll2(_response);
        });
    }

    protected processAttributesAll2(response: Response): Promise<Attribute[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(Attribute.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Attribute[]>(null as any);
    }

    /**
     * Add an attribute to a decomposable class
     * @param decClasseUuid The uuid of a decomposable class
     * @param body New attribute object
     * @return Successful operation
     */
    attributesPOST2(decClasseUuid: string, body: Attribute): Promise<Attribute> {
        let url_ = this.baseUrl + "/metamodel/decomposableClasses/{DecClasseUuid}/attributes";
        if (decClasseUuid === undefined || decClasseUuid === null)
            throw new Error("The parameter 'decClasseUuid' must be defined.");
        url_ = url_.replace("{DecClasseUuid}", encodeURIComponent("" + decClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesPOST2(_response);
        });
    }

    protected processAttributesPOST2(response: Response): Promise<Attribute> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Attribute.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("User not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Attribute>(null as any);
    }

    /**
     * Delete all attributes of a decomposable class
     * @param decClasseUuid The uuid of a decomposable class
     * @return Attribute deleted successfully
     */
    attributesDELETE3(decClasseUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/decomposableClasses/{DecClasseUuid}/attributes";
        if (decClasseUuid === undefined || decClasseUuid === null)
            throw new Error("The parameter 'decClasseUuid' must be defined.");
        url_ = url_.replace("{DecClasseUuid}", encodeURIComponent("" + decClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesDELETE3(_response);
        });
    }

    protected processAttributesDELETE3(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid id supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get all aggregatable classes of a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @return Successful operation
     */
    aggregatorClassesAll(sceneTypeUuid: string): Promise<Class[]> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/aggregatorClasses";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAggregatorClassesAll(_response);
        });
    }

    protected processAggregatorClassesAll(response: Response): Promise<Class[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(Class.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Class[]>(null as any);
    }

    /**
     * Create a aggregatable class to a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @param body Created aggregatable class object
     * @return Successful operation
     */
    aggregatorClassesPOST(sceneTypeUuid: string, body: Class[]): Promise<Class> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/aggregatorClasses";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAggregatorClassesPOST(_response);
        });
    }

    protected processAggregatorClassesPOST(response: Response): Promise<Class> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Class.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Class>(null as any);
    }

    /**
     * Delete all classes of a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @return Classes type deleted successfully
     */
    aggregatorClassesDELETE(sceneTypeUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/aggregatorClasses";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAggregatorClassesDELETE(_response);
        });
    }

    protected processAggregatorClassesDELETE(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid id supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get a aggregatable class by uuid
     * @param agrClasseUuid The uuid of a aggregatable class
     * @return Successful operation
     */
    aggregatorClassesGET(agrClasseUuid: string): Promise<Class> {
        let url_ = this.baseUrl + "/metamodel/aggregatorClasses/{AgrClasseUuid}";
        if (agrClasseUuid === undefined || agrClasseUuid === null)
            throw new Error("The parameter 'agrClasseUuid' must be defined.");
        url_ = url_.replace("{AgrClasseUuid}", encodeURIComponent("" + agrClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAggregatorClassesGET(_response);
        });
    }

    protected processAggregatorClassesGET(response: Response): Promise<Class> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Class.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Class>(null as any);
    }

    /**
     * Update a aggregatable class
     * @param agrClasseUuid The uuid of a aggregatable class
     * @param body Updated aggregatable class object
     * @return Successful operation
     */
    aggregatorClassesPATCH(agrClasseUuid: string, body: Class): Promise<Class> {
        let url_ = this.baseUrl + "/metamodel/aggregatorClasses/{AgrClasseUuid}";
        if (agrClasseUuid === undefined || agrClasseUuid === null)
            throw new Error("The parameter 'agrClasseUuid' must be defined.");
        url_ = url_.replace("{AgrClasseUuid}", encodeURIComponent("" + agrClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAggregatorClassesPATCH(_response);
        });
    }

    protected processAggregatorClassesPATCH(response: Response): Promise<Class> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Class.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("User not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Class>(null as any);
    }

    /**
     * Delete a aggregatable class
     * @param agrClasseUuid The uuid of a aggregatable class
     * @return class deleted successfully
     */
    aggregatorClassesDELETE2(agrClasseUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/aggregatorClasses/{AgrClasseUuid}";
        if (agrClasseUuid === undefined || agrClasseUuid === null)
            throw new Error("The parameter 'agrClasseUuid' must be defined.");
        url_ = url_.replace("{AgrClasseUuid}", encodeURIComponent("" + agrClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAggregatorClassesDELETE2(_response);
        });
    }

    protected processAggregatorClassesDELETE2(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get all attributes of a aggregatable class by uuid
     * @param agrClasseUuid The uuid of a aggregatable class
     * @return Successful operation
     */
    attributesAll3(agrClasseUuid: string): Promise<Attribute[]> {
        let url_ = this.baseUrl + "/metamodel/aggregatorClasses/{AgrClasseUuid}/attributes";
        if (agrClasseUuid === undefined || agrClasseUuid === null)
            throw new Error("The parameter 'agrClasseUuid' must be defined.");
        url_ = url_.replace("{AgrClasseUuid}", encodeURIComponent("" + agrClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesAll3(_response);
        });
    }

    protected processAttributesAll3(response: Response): Promise<Attribute[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(Attribute.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Attribute[]>(null as any);
    }

    /**
     * Add an attribute to a aggregatable class
     * @param agrClasseUuid The uuid of a aggregatable class
     * @param body New attribute object
     * @return Successful operation
     */
    attributesPOST3(agrClasseUuid: string, body: Attribute): Promise<Attribute> {
        let url_ = this.baseUrl + "/metamodel/aggregatorClasses/{AgrClasseUuid}/attributes";
        if (agrClasseUuid === undefined || agrClasseUuid === null)
            throw new Error("The parameter 'agrClasseUuid' must be defined.");
        url_ = url_.replace("{AgrClasseUuid}", encodeURIComponent("" + agrClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesPOST3(_response);
        });
    }

    protected processAttributesPOST3(response: Response): Promise<Attribute> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Attribute.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("User not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Attribute>(null as any);
    }

    /**
     * Delete all attributes of a aggregatable class
     * @param agrClasseUuid The uuid of a aggregatable class
     * @return Attribute deleted successfully
     */
    attributesDELETE4(agrClasseUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/aggregatorClasses/{AgrClasseUuid}/attributes";
        if (agrClasseUuid === undefined || agrClasseUuid === null)
            throw new Error("The parameter 'agrClasseUuid' must be defined.");
        url_ = url_.replace("{AgrClasseUuid}", encodeURIComponent("" + agrClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesDELETE4(_response);
        });
    }

    protected processAttributesDELETE4(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid id supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get all relation classes of a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @return Successful operation
     */
    relationClassesAll(sceneTypeUuid: string): Promise<Relationclass[]> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/relationClasses";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRelationClassesAll(_response);
        });
    }

    protected processRelationClassesAll(response: Response): Promise<Relationclass[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(Relationclass.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Relationclass[]>(null as any);
    }

    /**
     * Create a relation class to a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @param body Created relation class object
     * @return Successful operation
     */
    relationClassesPOST(sceneTypeUuid: string, body: Relationclass): Promise<Relationclass> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/relationClasses";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRelationClassesPOST(_response);
        });
    }

    protected processRelationClassesPOST(response: Response): Promise<Relationclass> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Relationclass.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Relationclass>(null as any);
    }

    /**
     * Delete all relation classes of a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @return Classes type deleted successfully
     */
    relationClassesDELETE(sceneTypeUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/relationClasses";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRelationClassesDELETE(_response);
        });
    }

    protected processRelationClassesDELETE(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid id supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get a relation class by uuid
     * @param relClasseUuid The uuid of a relation class
     * @return Successful operation
     */
    relationClassesGET(relClasseUuid: string): Promise<Relationclass> {
        let url_ = this.baseUrl + "/metamodel/relationClasses/{RelClasseUuid}";
        if (relClasseUuid === undefined || relClasseUuid === null)
            throw new Error("The parameter 'relClasseUuid' must be defined.");
        url_ = url_.replace("{RelClasseUuid}", encodeURIComponent("" + relClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRelationClassesGET(_response);
        });
    }

    protected processRelationClassesGET(response: Response): Promise<Relationclass> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Relationclass.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Relationclass>(null as any);
    }

    /**
     * Update a relation class
     * @param relClasseUuid The uuid of a relation class
     * @param body Updated relation class object
     * @return Successful operation
     */
    relationClassesPATCH(relClasseUuid: string, body: Relationclass): Promise<Relationclass> {
        let url_ = this.baseUrl + "/metamodel/relationClasses/{RelClasseUuid}";
        if (relClasseUuid === undefined || relClasseUuid === null)
            throw new Error("The parameter 'relClasseUuid' must be defined.");
        url_ = url_.replace("{RelClasseUuid}", encodeURIComponent("" + relClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRelationClassesPATCH(_response);
        });
    }

    protected processRelationClassesPATCH(response: Response): Promise<Relationclass> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Relationclass.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("User not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Relationclass>(null as any);
    }

    /**
     * Delete a relation class
     * @param relClasseUuid The uuid of a relation class
     * @return class deleted successfully
     */
    relationClassesDELETE2(relClasseUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/relationClasses/{RelClasseUuid}";
        if (relClasseUuid === undefined || relClasseUuid === null)
            throw new Error("The parameter 'relClasseUuid' must be defined.");
        url_ = url_.replace("{RelClasseUuid}", encodeURIComponent("" + relClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRelationClassesDELETE2(_response);
        });
    }

    protected processRelationClassesDELETE2(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get all attributes of a relation class by uuid
     * @param relClasseUuid The uuid of a relation class
     * @return Successful operation
     */
    attributesAll4(relClasseUuid: string): Promise<Attribute[]> {
        let url_ = this.baseUrl + "/metamodel/relationClasses/{RelClasseUuid}/attributes";
        if (relClasseUuid === undefined || relClasseUuid === null)
            throw new Error("The parameter 'relClasseUuid' must be defined.");
        url_ = url_.replace("{RelClasseUuid}", encodeURIComponent("" + relClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesAll4(_response);
        });
    }

    protected processAttributesAll4(response: Response): Promise<Attribute[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(Attribute.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Attribute[]>(null as any);
    }

    /**
     * Add an attribute to a relation class
     * @param relClasseUuid The uuid of a relation class
     * @param body New attribute object
     * @return Successful operation
     */
    attributesPOST4(relClasseUuid: string, body: Attribute): Promise<Attribute> {
        let url_ = this.baseUrl + "/metamodel/relationClasses/{RelClasseUuid}/attributes";
        if (relClasseUuid === undefined || relClasseUuid === null)
            throw new Error("The parameter 'relClasseUuid' must be defined.");
        url_ = url_.replace("{RelClasseUuid}", encodeURIComponent("" + relClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesPOST4(_response);
        });
    }

    protected processAttributesPOST4(response: Response): Promise<Attribute> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Attribute.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("User not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Attribute>(null as any);
    }

    /**
     * Delete all attributes of a relation class
     * @param relClasseUuid The uuid of a relation class
     * @return Attribute deleted successfully
     */
    attributesDELETE5(relClasseUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/relationClasses/{RelClasseUuid}/attributes";
        if (relClasseUuid === undefined || relClasseUuid === null)
            throw new Error("The parameter 'relClasseUuid' must be defined.");
        url_ = url_.replace("{RelClasseUuid}", encodeURIComponent("" + relClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesDELETE5(_response);
        });
    }

    protected processAttributesDELETE5(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid id supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get attribute role from of a relation class by uuid
     * @param relClasseUuid The uuid of a relation class
     * @return Successful operation
     */
    roleFrom(relClasseUuid: string): Promise<Role[]> {
        let url_ = this.baseUrl + "/metamodel/relationClasses/{RelClasseUuid}/roleFrom";
        if (relClasseUuid === undefined || relClasseUuid === null)
            throw new Error("The parameter 'relClasseUuid' must be defined.");
        url_ = url_.replace("{RelClasseUuid}", encodeURIComponent("" + relClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRoleFrom(_response);
        });
    }

    protected processRoleFrom(response: Response): Promise<Role[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(Role.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Role[]>(null as any);
    }

    /**
     * Get attribute role to of a relation class by uuid
     * @param relClasseUuid The uuid of a relation class
     * @return Successful operation
     */
    roleTo(relClasseUuid: string): Promise<Role[]> {
        let url_ = this.baseUrl + "/metamodel/relationClasses/{RelClasseUuid}/roleTo";
        if (relClasseUuid === undefined || relClasseUuid === null)
            throw new Error("The parameter 'relClasseUuid' must be defined.");
        url_ = url_.replace("{RelClasseUuid}", encodeURIComponent("" + relClasseUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRoleTo(_response);
        });
    }

    protected processRoleTo(response: Response): Promise<Role[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(Role.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Role[]>(null as any);
    }

    /**
     * Get all roles of a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @return Successful operation
     */
    rolesAll(sceneTypeUuid: string): Promise<Role[]> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/roles";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRolesAll(_response);
        });
    }

    protected processRolesAll(response: Response): Promise<Role[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(Role.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Role[]>(null as any);
    }

    /**
     * Create a role to a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @param body Created role object
     * @return Successful operation
     */
    rolesPOST(sceneTypeUuid: string, body: Role): Promise<Role> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/roles";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRolesPOST(_response);
        });
    }

    protected processRolesPOST(response: Response): Promise<Role> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Role.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Role>(null as any);
    }

    /**
     * Delete all roles of a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @return Roles type deleted successfully
     */
    rolesDELETE(sceneTypeUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/roles";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRolesDELETE(_response);
        });
    }

    protected processRolesDELETE(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid id supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get a role by uuid
     * @param rolesUuid The uuid of a role
     * @return Successful operation
     */
    rolesGET(rolesUuid: string): Promise<Role> {
        let url_ = this.baseUrl + "/metamodel/roles/{RolesUuid}";
        if (rolesUuid === undefined || rolesUuid === null)
            throw new Error("The parameter 'rolesUuid' must be defined.");
        url_ = url_.replace("{RolesUuid}", encodeURIComponent("" + rolesUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRolesGET(_response);
        });
    }

    protected processRolesGET(response: Response): Promise<Role> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Role.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Role not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Role>(null as any);
    }

    /**
     * Update a role
     * @param rolesUuid The uuid of a role
     * @param body Updated role object
     * @return Successful operation
     */
    rolesPATCH(rolesUuid: string, body: Role): Promise<Role> {
        let url_ = this.baseUrl + "/metamodel/roles/{RolesUuid}";
        if (rolesUuid === undefined || rolesUuid === null)
            throw new Error("The parameter 'rolesUuid' must be defined.");
        url_ = url_.replace("{RolesUuid}", encodeURIComponent("" + rolesUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRolesPATCH(_response);
        });
    }

    protected processRolesPATCH(response: Response): Promise<Role> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Role.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Role not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Role>(null as any);
    }

    /**
     * Delete a role
     * @param rolesUuid The uuid of a role
     * @return class deleted successfully
     */
    rolesDELETE2(rolesUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/roles/{RolesUuid}";
        if (rolesUuid === undefined || rolesUuid === null)
            throw new Error("The parameter 'rolesUuid' must be defined.");
        url_ = url_.replace("{RolesUuid}", encodeURIComponent("" + rolesUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRolesDELETE2(_response);
        });
    }

    protected processRolesDELETE2(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get all ports of a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @return Successful operation
     */
    portsAll(sceneTypeUuid: string): Promise<Role[]> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/ports";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processPortsAll(_response);
        });
    }

    protected processPortsAll(response: Response): Promise<Role[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(Role.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Role[]>(null as any);
    }

    /**
     * Create a ports to a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @param body Created ports object
     * @return Successful operation
     */
    portsPOST(sceneTypeUuid: string, body: Port): Promise<Port> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/ports";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processPortsPOST(_response);
        });
    }

    protected processPortsPOST(response: Response): Promise<Port> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Port.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Port>(null as any);
    }

    /**
     * Delete all ports of a scene type by uuid
     * @param sceneTypeUuid The uuid of a scene type
     * @return Ports type deleted successfully
     */
    portsDELETE(sceneTypeUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/ports";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processPortsDELETE(_response);
        });
    }

    protected processPortsDELETE(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid id supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get a ports by uuid
     * @param portsUuid The uuid of a ports
     * @return Successful operation
     */
    portsGET(portsUuid: string): Promise<Port> {
        let url_ = this.baseUrl + "/metamodel/ports/{PortsUuid}";
        if (portsUuid === undefined || portsUuid === null)
            throw new Error("The parameter 'portsUuid' must be defined.");
        url_ = url_.replace("{PortsUuid}", encodeURIComponent("" + portsUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processPortsGET(_response);
        });
    }

    protected processPortsGET(response: Response): Promise<Port> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Port.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Role not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Port>(null as any);
    }

    /**
     * Update a ports
     * @param portsUuid The uuid of a ports
     * @param body Updated ports object
     * @return Successful operation
     */
    portsPATCH(portsUuid: string, body: Port): Promise<Port> {
        let url_ = this.baseUrl + "/metamodel/ports/{PortsUuid}";
        if (portsUuid === undefined || portsUuid === null)
            throw new Error("The parameter 'portsUuid' must be defined.");
        url_ = url_.replace("{PortsUuid}", encodeURIComponent("" + portsUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processPortsPATCH(_response);
        });
    }

    protected processPortsPATCH(response: Response): Promise<Port> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Port.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Role not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Port>(null as any);
    }

    /**
     * Delete a role
     * @param portsUuid The uuid of a role
     * @return class deleted successfully
     */
    portsDELETE2(portsUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/ports/{PortsUuid}";
        if (portsUuid === undefined || portsUuid === null)
            throw new Error("The parameter 'portsUuid' must be defined.");
        url_ = url_.replace("{PortsUuid}", encodeURIComponent("" + portsUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processPortsDELETE2(_response);
        });
    }

    protected processPortsDELETE2(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get all attributes of a port by uuid
     * @param portsUuid The uuid of a port
     * @return Successful operation
     */
    attributesAll5(portsUuid: string): Promise<Attribute[]> {
        let url_ = this.baseUrl + "/metamodel/ports/{PortsUuid}/attributes";
        if (portsUuid === undefined || portsUuid === null)
            throw new Error("The parameter 'portsUuid' must be defined.");
        url_ = url_.replace("{PortsUuid}", encodeURIComponent("" + portsUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesAll5(_response);
        });
    }

    protected processAttributesAll5(response: Response): Promise<Attribute[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(Attribute.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Attribute[]>(null as any);
    }

    /**
     * Add an attribute to a port
     * @param portsUuid The uuid of a port
     * @param body New attribute object
     * @return Successful operation
     */
    attributesPOST5(portsUuid: string, body: Attribute): Promise<Attribute> {
        let url_ = this.baseUrl + "/metamodel/ports/{PortsUuid}/attributes";
        if (portsUuid === undefined || portsUuid === null)
            throw new Error("The parameter 'portsUuid' must be defined.");
        url_ = url_.replace("{PortsUuid}", encodeURIComponent("" + portsUuid));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesPOST5(_response);
        });
    }

    protected processAttributesPOST5(response: Response): Promise<Attribute> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Attribute.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("User not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Attribute>(null as any);
    }

    /**
     * Delete all attributes of a port
     * @param portsUuid The uuid of a port
     * @return Attribute deleted successfully
     */
    attributesDELETE6(portsUuid: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/ports/{PortsUuid}/attributes";
        if (portsUuid === undefined || portsUuid === null)
            throw new Error("The parameter 'portsUuid' must be defined.");
        url_ = url_.replace("{PortsUuid}", encodeURIComponent("" + portsUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesDELETE6(_response);
        });
    }

    protected processAttributesDELETE6(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid id supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get an attribute by uuid
     * @param attributesUUID The uuid of an attribute
     * @return Successful operation
     */
    attributesGET(attributesUUID: string): Promise<Attribute> {
        let url_ = this.baseUrl + "/metamodel/attributes/{AttributesUUID}";
        if (attributesUUID === undefined || attributesUUID === null)
            throw new Error("The parameter 'attributesUUID' must be defined.");
        url_ = url_.replace("{AttributesUUID}", encodeURIComponent("" + attributesUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesGET(_response);
        });
    }

    protected processAttributesGET(response: Response): Promise<Attribute> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Attribute.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Attribute>(null as any);
    }

    /**
     * Update an attribute
     * @param attributesUUID The uuid of an attribute
     * @param body Updated attribute object
     * @return Successful operation
     */
    attributesPATCH(attributesUUID: string, body: Attribute): Promise<Attribute> {
        let url_ = this.baseUrl + "/metamodel/attributes/{AttributesUUID}";
        if (attributesUUID === undefined || attributesUUID === null)
            throw new Error("The parameter 'attributesUUID' must be defined.");
        url_ = url_.replace("{AttributesUUID}", encodeURIComponent("" + attributesUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesPATCH(_response);
        });
    }

    protected processAttributesPATCH(response: Response): Promise<Attribute> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Attribute.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("User not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Attribute>(null as any);
    }

    /**
     * Delete an attribute
     * @param attributesUUID The uuid of an attribute
     * @return Attribute deleted successfully
     */
    attributesDELETE7(attributesUUID: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/attributes/{AttributesUUID}";
        if (attributesUUID === undefined || attributesUUID === null)
            throw new Error("The parameter 'attributesUUID' must be defined.");
        url_ = url_.replace("{AttributesUUID}", encodeURIComponent("" + attributesUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributesDELETE7(_response);
        });
    }

    protected processAttributesDELETE7(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid id supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get all attribute types of an attribute by uuid
     * @param attributesUUID The uuid of an attribute
     * @return Successful operation
     */
    attributeTypeAll(attributesUUID: string): Promise<AttributeType[]> {
        let url_ = this.baseUrl + "/metamodel/attributes/{AttributesUUID}/attributeType";
        if (attributesUUID === undefined || attributesUUID === null)
            throw new Error("The parameter 'attributesUUID' must be defined.");
        url_ = url_.replace("{AttributesUUID}", encodeURIComponent("" + attributesUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributeTypeAll(_response);
        });
    }

    protected processAttributeTypeAll(response: Response): Promise<AttributeType[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(AttributeType.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Attribute type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<AttributeType[]>(null as any);
    }

    /**
     * Add an attribute to an attribute
     * @param attributesUUID The uuid of an attribute
     * @param body New attribute type object
     * @return Successful operation
     */
    attributeTypePOST(attributesUUID: string, body: AttributeType): Promise<AttributeType> {
        let url_ = this.baseUrl + "/metamodel/attributes/{AttributesUUID}/attributeType";
        if (attributesUUID === undefined || attributesUUID === null)
            throw new Error("The parameter 'attributesUUID' must be defined.");
        url_ = url_.replace("{AttributesUUID}", encodeURIComponent("" + attributesUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributeTypePOST(_response);
        });
    }

    protected processAttributeTypePOST(response: Response): Promise<AttributeType> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = AttributeType.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Attribute not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<AttributeType>(null as any);
    }

    /**
     * Delete all attribute type of an attribute
     * @param attributesUUID The uuid of an attribute
     * @return Attribute type deleted successfully
     */
    attributeTypeDELETE(attributesUUID: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/attributes/{AttributesUUID}/attributeType";
        if (attributesUUID === undefined || attributesUUID === null)
            throw new Error("The parameter 'attributesUUID' must be defined.");
        url_ = url_.replace("{AttributesUUID}", encodeURIComponent("" + attributesUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributeTypeDELETE(_response);
        });
    }

    protected processAttributeTypeDELETE(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid id supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    /**
     * Get an attribute type by uuid
     * @param attributeTypeUUID The uuid of an attribute type
     * @return Successful operation
     */
    attributeTypeGET(attributeTypeUUID: string): Promise<AttributeType> {
        let url_ = this.baseUrl + "/metamodel/attributeType/{AttributeTypeUUID}";
        if (attributeTypeUUID === undefined || attributeTypeUUID === null)
            throw new Error("The parameter 'attributeTypeUUID' must be defined.");
        url_ = url_.replace("{AttributeTypeUUID}", encodeURIComponent("" + attributeTypeUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributeTypeGET(_response);
        });
    }

    protected processAttributeTypeGET(response: Response): Promise<AttributeType> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = AttributeType.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<AttributeType>(null as any);
    }

    /**
     * Update an attribute type
     * @param attributeTypeUUID The uuid of an attribute type
     * @param body Updated attribute type object
     * @return Successful operation
     */
    attributeTypePATCH(attributeTypeUUID: string, body: AttributeType): Promise<AttributeType> {
        let url_ = this.baseUrl + "/metamodel/attributeType/{AttributeTypeUUID}";
        if (attributeTypeUUID === undefined || attributeTypeUUID === null)
            throw new Error("The parameter 'attributeTypeUUID' must be defined.");
        url_ = url_.replace("{AttributeTypeUUID}", encodeURIComponent("" + attributeTypeUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributeTypePATCH(_response);
        });
    }

    protected processAttributeTypePATCH(response: Response): Promise<AttributeType> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = AttributeType.fromJS(resultData200);
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("User not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<AttributeType>(null as any);
    }

    /**
     * Delete an attribute type
     * @param attributeTypeUUID The uuid of an attribute-type
     * @return Attribute type deleted successfully
     */
    attributeTypeDELETE2(attributeTypeUUID: string): Promise<void> {
        let url_ = this.baseUrl + "/metamodel/attributeType/{AttributeTypeUUID}";
        if (attributeTypeUUID === undefined || attributeTypeUUID === null)
            throw new Error("The parameter 'attributeTypeUUID' must be defined.");
        url_ = url_.replace("{AttributeTypeUUID}", encodeURIComponent("" + attributeTypeUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributeTypeDELETE2(_response);
        });
    }

    protected processAttributeTypeDELETE2(response: Response): Promise<void> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 204) {
            return response.text().then((_responseText) => {
                return;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid id supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<void>(null as any);
    }

    // Procedure section created by Marcel Buehlmann --------------------------------------------------------
    getProcedures(): Promise<Procedure> {
        let url_ = this.baseUrl + "/metamodel/procedures";
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processGetProcedures(_response);
        });
    }

    getAssignedProcedures(sceneTypeUuid: string): Promise<Procedure> {
        let url_ = this.baseUrl + "/metamodel/sceneTypes/{SceneTypeUuid}/procedures";
        if (sceneTypeUuid === undefined || sceneTypeUuid === null)
            throw new Error("The parameter 'sceneTypeUuid' must be defined.");
        url_ = url_.replace("{SceneTypeUuid}", encodeURIComponent("" + sceneTypeUuid));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processGetProcedureOfSceneTypeById(_response);
        });
    }

    protected processGetProcedureOfSceneTypeById(response: Response): Promise<Procedure> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(Procedure.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid uuid supplied", status, _responseText, _headers, result400);
            });
        } else if (status === 404) {
            return response.text().then((_responseText) => {
                let result404: any = null;
                let resultData404 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result404 = ErrorDto.fromJS(resultData404);
                return throwException("Scene type not found", status, _responseText, _headers, result404);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Procedure>(null as any);
    }

    protected processGetProcedures(response: Response): Promise<Procedure> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = Procedure.fromJS(resultData200);
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<Procedure>(null as any);
    }
    // End of procedure endpoints --------------------------------------------------------






    //---------------------------------------------------------------------------------
    // Instances
    // --------------------------------------------------------------------------------------
    /**
     * Get the list of all scene instances of a scene type
     * @param sceneTypeUUID The uuid of a scene type
     * @return Successful operation
     */
    sceneInstancesAllGET(sceneTypeUUID: string): Promise<SceneInstance[]> {
        let url_ = this.baseUrl + "/instances/sceneTypes/{SceneTypeUUID}/sceneInstances";
        if (sceneTypeUUID === undefined || sceneTypeUUID === null)
            throw new Error("The parameter 'sceneTypeUUID' must be defined.");
        url_ = url_.replace("{SceneTypeUUID}", encodeURIComponent("" + sceneTypeUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processSceneInstancesAllGET(_response);
        });
    }

    protected processSceneInstancesAllGET(response: Response): Promise<SceneInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(SceneInstance.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<SceneInstance[]>(null as any);
    }

    /**
     * Create a new scene instance
     * @param sceneTypeUUID The uuid of a scene type
     * @param body Create a new scene instance
     * @return Scene instance created successfully
     */
    sceneInstancesPOST(sceneTypeUUID: string, body: SceneInstance): Promise<SceneInstance> {
        let url_ = this.baseUrl + "/instances/sceneTypes/{SceneTypeUUID}/sceneInstances";
        if (sceneTypeUUID === undefined || sceneTypeUUID === null)
            throw new Error("The parameter 'sceneTypeUUID' must be defined.");
        url_ = url_.replace("{SceneTypeUUID}", encodeURIComponent("" + sceneTypeUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processSceneInstancesPOST(_response);
        });
    }

    protected processSceneInstancesPOST(response: Response): Promise<SceneInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = SceneInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<SceneInstance>(null as any);
    }

    /**
     * Delete a all scene instances of a scene type
     * @param sceneTypeUUID The uuid of a scene type
     * @return Scene instances deleted successfully
     */
    sceneInstancesAllDELETE(sceneTypeUUID: string): Promise<SceneInstance[]> {
        let url_ = this.baseUrl + "/instances/sceneTypes/{SceneTypeUUID}/sceneInstances";
        if (sceneTypeUUID === undefined || sceneTypeUUID === null)
            throw new Error("The parameter 'sceneTypeUUID' must be defined.");
        url_ = url_.replace("{SceneTypeUUID}", encodeURIComponent("" + sceneTypeUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processSceneInstancesAllDELETE(_response);
        });
    }

    protected processSceneInstancesAllDELETE(response: Response): Promise<SceneInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData201)) {
                    result201 = [] as any;
                    for (let item of resultData201)
                        result201!.push(SceneInstance.fromJS(item));
                }
                else {
                    result201 = <any>null;
                }
                return result201;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<SceneInstance[]>(null as any);
    }

    /**
     * Get a scene instance
     * @param sceneInstanceUUID The uuid of a scene instance
     * @return Successful operation
     */
    sceneInstancesGET(sceneInstanceUUID: string): Promise<SceneInstance> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processSceneInstancesGET(_response);
        });
    }

    protected processSceneInstancesGET(response: Response): Promise<SceneInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = SceneInstance.fromJS(resultData200);
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<SceneInstance>(null as any);
    }

    /**
     * Update a scene instance
     * @param sceneInstanceUUID The uuid of a scene instance
     * @param body Updated scene instance
     * @return Scene instance updated successfully
     */
    sceneInstancesPATCH(sceneInstanceUUID: string, body: SceneInstance): Promise<SceneInstance> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processSceneInstancesPATCH(_response);
        });
    }

    protected processSceneInstancesPATCH(response: Response): Promise<SceneInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = SceneInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<SceneInstance>(null as any);
    }

    /**
     * Delete a scene instance
     * @param sceneInstanceUUID The uuid of a scene instance
     * @return Scene instance deleted successfully
     */
    sceneInstancesAllDELETE2(sceneInstanceUUID: string): Promise<SceneInstance[]> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processSceneInstancesAllDELETE2(_response);
        });
    }

    protected processSceneInstancesAllDELETE2(response: Response): Promise<SceneInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData201)) {
                    result201 = [] as any;
                    for (let item of resultData201)
                        result201!.push(SceneInstance.fromJS(item));
                }
                else {
                    result201 = <any>null;
                }
                return result201;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<SceneInstance[]>(null as any);
    }

    /**
     * Create a scene instance not linked to a scene type
     * @param metaSceneUUID The uuid of a meta scene
     * @param body Created scene instance
     * @return scene instance created successfully
     */
    sceneInstancesPOST2(metaSceneUUID: string, body: SceneInstance): Promise<SceneInstance> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{MetaSceneUUID}";
        if (metaSceneUUID === undefined || metaSceneUUID === null)
            throw new Error("The parameter 'metaSceneUUID' must be defined.");
        url_ = url_.replace("{MetaSceneUUID}", encodeURIComponent("" + metaSceneUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processSceneInstancesPOST2(_response);
        });
    }

    protected processSceneInstancesPOST2(response: Response): Promise<SceneInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = SceneInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<SceneInstance>(null as any);
    }

    /**
     * Get the list of all class instances of a scene instance
     * @param sceneInstanceUUID The uuid of a scene instance
     * @return Successful operation
     */
    classesInstancesAllGET(sceneInstanceUUID: string): Promise<ClassInstance[]> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/classesInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processClassesInstancesAllGET(_response);
        });
    }

    protected processClassesInstancesAllGET(response: Response): Promise<ClassInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(ClassInstance.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance[]>(null as any);
    }

    /**
     * Create a new class instance
     * @param sceneInstanceUUID The uuid of a scene instance
     * @param body Create a new class instance
     * @return Class instance created successfully
     */
    classesInstancesPOST(sceneInstanceUUID: string, body: ClassInstance): Promise<ClassInstance> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/classesInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processClassesInstancesPOST(_response);
        });
    }

    protected processClassesInstancesPOST(response: Response): Promise<ClassInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = ClassInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance>(null as any);
    }

    /**
     * Delete a all class instances of a scene instance
     * @param sceneInstanceUUID The uuid of a scene instance
     * @return Classes instances deleted successfully
     */
    classesInstancesAllDELETE(sceneInstanceUUID: string): Promise<ClassInstance[]> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/classesInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processClassesInstancesAllDELETE(_response);
        });
    }

    protected processClassesInstancesAllDELETE(response: Response): Promise<ClassInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData201)) {
                    result201 = [] as any;
                    for (let item of resultData201)
                        result201!.push(ClassInstance.fromJS(item));
                }
                else {
                    result201 = <any>null;
                }
                return result201;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance[]>(null as any);
    }

    /**
     * Get a class instances
     * @param classInstanceUUID The uuid of a class instance
     * @return Successful operation
     */
    classesInstancesGET(classInstanceUUID: string): Promise<ClassInstance> {
        let url_ = this.baseUrl + "/instances/classesInstances/{ClassInstanceUUID}";
        if (classInstanceUUID === undefined || classInstanceUUID === null)
            throw new Error("The parameter 'classInstanceUUID' must be defined.");
        url_ = url_.replace("{ClassInstanceUUID}", encodeURIComponent("" + classInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processClassesInstancesGET(_response);
        });
    }

    protected processClassesInstancesGET(response: Response): Promise<ClassInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = ClassInstance.fromJS(resultData200);
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance>(null as any);
    }

    /**
     * Update a class instance
     * @param classInstanceUUID The uuid of a class instance
     * @param body Updated class instance
     * @return class instance updated successfully
     */
    classesInstancesPATCH(classInstanceUUID: string, body: ClassInstance): Promise<ClassInstance> {
        let url_ = this.baseUrl + "/instances/classesInstances/{ClassInstanceUUID}";
        if (classInstanceUUID === undefined || classInstanceUUID === null)
            throw new Error("The parameter 'classInstanceUUID' must be defined.");
        url_ = url_.replace("{ClassInstanceUUID}", encodeURIComponent("" + classInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processClassesInstancesPATCH(_response);
        });
    }

    protected processClassesInstancesPATCH(response: Response): Promise<ClassInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = ClassInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance>(null as any);
    }

    /**
     * Delete a class instances
     * @param classInstanceUUID The uuid of a class instance
     * @return class instance deleted successfully
     */
    classesInstancesAllDELETE2(classInstanceUUID: string): Promise<ClassInstance[]> {
        let url_ = this.baseUrl + "/instances/classesInstances/{ClassInstanceUUID}";
        if (classInstanceUUID === undefined || classInstanceUUID === null)
            throw new Error("The parameter 'classInstanceUUID' must be defined.");
        url_ = url_.replace("{ClassInstanceUUID}", encodeURIComponent("" + classInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processClassesInstancesAllDELETE2(_response);
        });
    }

    protected processClassesInstancesAllDELETE2(response: Response): Promise<ClassInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData201)) {
                    result201 = [] as any;
                    for (let item of resultData201)
                        result201!.push(ClassInstance.fromJS(item));
                }
                else {
                    result201 = <any>null;
                }
                return result201;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance[]>(null as any);
    }

    /**
     * Create a decomposable class instance not linked to a scene type
     * @param metaClassUUID The uuid of a meta class
     * @param body Created decomposable class instance
     * @return decomposable class instance created successfully
     */
    classesInstancesPOST2(metaClassUUID: string, body: ClassInstance): Promise<ClassInstance> {
        let url_ = this.baseUrl + "/instances/classesInstances/{MetaClassUUID}";
        if (metaClassUUID === undefined || metaClassUUID === null)
            throw new Error("The parameter 'metaClassUUID' must be defined.");
        url_ = url_.replace("{MetaClassUUID}", encodeURIComponent("" + metaClassUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processClassesInstancesPOST2(_response);
        });
    }

    protected processClassesInstancesPOST2(response: Response): Promise<ClassInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = ClassInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance>(null as any);
    }

    /**
     * Get the list of all decomposable class instances of a scene type
     * @param sceneInstanceUUID The uuid of a scene type
     * @return Successful operation
     */
    decomposableClassInstancesAllGET(sceneInstanceUUID: string): Promise<ClassInstance[]> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/decomposableClassInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processDecomposableClassInstancesAllGET(_response);
        });
    }

    protected processDecomposableClassInstancesAllGET(response: Response): Promise<ClassInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(ClassInstance.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance[]>(null as any);
    }

    /**
     * Create a new decomposable class instance
     * @param sceneInstanceUUID The uuid of a scene instance
     * @param body Create a new class instance
     * @return Decomposable class instance created successfully
     */
    decomposableClassInstancesPOST(sceneInstanceUUID: string, body: ClassInstance): Promise<ClassInstance> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/decomposableClassInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processDecomposableClassInstancesPOST(_response);
        });
    }

    protected processDecomposableClassInstancesPOST(response: Response): Promise<ClassInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = ClassInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance>(null as any);
    }

    /**
     * Delete a all decomposable class instances of a scene instance
     * @param sceneInstanceUUID The uuid of a scene instance
     * @return Decomposable classes instances deleted successfully
     */
    decomposableClassInstancesAllDELETE(sceneInstanceUUID: string): Promise<ClassInstance[]> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/decomposableClassInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processDecomposableClassInstancesAllDELETE(_response);
        });
    }

    protected processDecomposableClassInstancesAllDELETE(response: Response): Promise<ClassInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData201)) {
                    result201 = [] as any;
                    for (let item of resultData201)
                        result201!.push(ClassInstance.fromJS(item));
                }
                else {
                    result201 = <any>null;
                }
                return result201;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance[]>(null as any);
    }

    /**
     * Get a decomposable class instance
     * @param decClassUUID The uuid of a decomposable class instance
     * @return Successful operation
     */
    decomposableClassInstancesGET(decClassUUID: string): Promise<ClassInstance> {
        let url_ = this.baseUrl + "/instances/decomposableClassInstances/{DecClassUUID}";
        if (decClassUUID === undefined || decClassUUID === null)
            throw new Error("The parameter 'decClassUUID' must be defined.");
        url_ = url_.replace("{DecClassUUID}", encodeURIComponent("" + decClassUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processDecomposableClassInstancesGET(_response);
        });
    }

    protected processDecomposableClassInstancesGET(response: Response): Promise<ClassInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = ClassInstance.fromJS(resultData200);
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance>(null as any);
    }

    /**
     * Update a decomposable class instance
     * @param decClassUUID The uuid of a decomposable class instance
     * @param body Updated decomposable class instance
     * @return decomposable class instance updated successfully
     */
    decomposableClassInstancesPATCH(decClassUUID: string, body: ClassInstance): Promise<ClassInstance> {
        let url_ = this.baseUrl + "/instances/decomposableClassInstances/{DecClassUUID}";
        if (decClassUUID === undefined || decClassUUID === null)
            throw new Error("The parameter 'decClassUUID' must be defined.");
        url_ = url_.replace("{DecClassUUID}", encodeURIComponent("" + decClassUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processDecomposableClassInstancesPATCH(_response);
        });
    }

    protected processDecomposableClassInstancesPATCH(response: Response): Promise<ClassInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = ClassInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance>(null as any);
    }

    /**
     * Delete a decomposable class instance
     * @param decClassUUID The uuid of a decomposable class instance
     * @return decomposable class instance deleted successfully
     */
    decomposableClassInstancesAllDELETE2(decClassUUID: string): Promise<ClassInstance[]> {
        let url_ = this.baseUrl + "/instances/decomposableClassInstances/{DecClassUUID}";
        if (decClassUUID === undefined || decClassUUID === null)
            throw new Error("The parameter 'decClassUUID' must be defined.");
        url_ = url_.replace("{DecClassUUID}", encodeURIComponent("" + decClassUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processDecomposableClassInstancesAllDELETE2(_response);
        });
    }

    protected processDecomposableClassInstancesAllDELETE2(response: Response): Promise<ClassInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData201)) {
                    result201 = [] as any;
                    for (let item of resultData201)
                        result201!.push(ClassInstance.fromJS(item));
                }
                else {
                    result201 = <any>null;
                }
                return result201;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance[]>(null as any);
    }

    /**
     * Create a decomposable class instance not linked to a scene type
     * @param metaClassUUID The uuid of a meta class
     * @param body Created decomposable class instance
     * @return decomposable class instance created successfully
     */
    decomposableClassInstancesPOST2(metaClassUUID: string, body: ClassInstance): Promise<ClassInstance> {
        let url_ = this.baseUrl + "/instances/decomposableClassInstances/{MetaClassUUID}";
        if (metaClassUUID === undefined || metaClassUUID === null)
            throw new Error("The parameter 'metaClassUUID' must be defined.");
        url_ = url_.replace("{MetaClassUUID}", encodeURIComponent("" + metaClassUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processDecomposableClassInstancesPOST2(_response);
        });
    }

    protected processDecomposableClassInstancesPOST2(response: Response): Promise<ClassInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = ClassInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance>(null as any);
    }

    /**
     * Get the list of all aggregable class instances of a scene type
     * @param sceneInstanceUUID The uuid of a scene instance
     * @return Successful operation
     */
    aggregatorClassInstancesAllGET(sceneInstanceUUID: string): Promise<ClassInstance[]> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/aggregatorClassInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAggregatorClassInstancesAllGET(_response);
        });
    }

    protected processAggregatorClassInstancesAllGET(response: Response): Promise<ClassInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(ClassInstance.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance[]>(null as any);
    }

    /**
     * Create a new aggregable class instance
     * @param sceneInstanceUUID The uuid of a scene instance
     * @param body Create a new aggregable class instance
     * @return Aggregable class instance created successfully
     */
    aggregatorClassInstancesPOST(sceneInstanceUUID: string, body: ClassInstance): Promise<ClassInstance> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/aggregatorClassInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAggregatorClassInstancesPOST(_response);
        });
    }

    protected processAggregatorClassInstancesPOST(response: Response): Promise<ClassInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = ClassInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance>(null as any);
    }

    /**
     * Delete a all aggregable class instances of a scene instance
     * @param sceneInstanceUUID The uuid of a scene instance
     * @return Aggregable classes instances deleted successfully
     */
    aggregatorClassInstancesAllDELETE(sceneInstanceUUID: string): Promise<ClassInstance[]> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/aggregatorClassInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAggregatorClassInstancesAllDELETE(_response);
        });
    }

    protected processAggregatorClassInstancesAllDELETE(response: Response): Promise<ClassInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData201)) {
                    result201 = [] as any;
                    for (let item of resultData201)
                        result201!.push(ClassInstance.fromJS(item));
                }
                else {
                    result201 = <any>null;
                }
                return result201;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance[]>(null as any);
    }

    /**
     * Get an aggregable class instance
     * @param agrClassUUID The uuid of a aggregable class instance
     * @return Successful operation
     */
    aggregatorClassInstancesGET(agrClassUUID: string): Promise<ClassInstance> {
        let url_ = this.baseUrl + "/instances/aggregatorClassInstances/{AgrClassUUID}";
        if (agrClassUUID === undefined || agrClassUUID === null)
            throw new Error("The parameter 'agrClassUUID' must be defined.");
        url_ = url_.replace("{AgrClassUUID}", encodeURIComponent("" + agrClassUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAggregatorClassInstancesGET(_response);
        });
    }

    protected processAggregatorClassInstancesGET(response: Response): Promise<ClassInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = ClassInstance.fromJS(resultData200);
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance>(null as any);
    }

    /**
     * Update an aggregable class instance
     * @param agrClassUUID The uuid of a aggregable class instance
     * @param body Updated aggregable class instance
     * @return aggregable class instance updated successfully
     */
    aggregatorClassInstancesPATCH(agrClassUUID: string, body: ClassInstance): Promise<ClassInstance> {
        let url_ = this.baseUrl + "/instances/aggregatorClassInstances/{AgrClassUUID}";
        if (agrClassUUID === undefined || agrClassUUID === null)
            throw new Error("The parameter 'agrClassUUID' must be defined.");
        url_ = url_.replace("{AgrClassUUID}", encodeURIComponent("" + agrClassUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAggregatorClassInstancesPATCH(_response);
        });
    }

    protected processAggregatorClassInstancesPATCH(response: Response): Promise<ClassInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = ClassInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance>(null as any);
    }

    /**
     * Delete an aggregable class instance
     * @param agrClassUUID The uuid of a aggregable class instance
     * @return aggregable class instance deleted successfully
     */
    aggregatorClassInstancesAllDELETE2(agrClassUUID: string): Promise<ClassInstance[]> {
        let url_ = this.baseUrl + "/instances/aggregatorClassInstances/{AgrClassUUID}";
        if (agrClassUUID === undefined || agrClassUUID === null)
            throw new Error("The parameter 'agrClassUUID' must be defined.");
        url_ = url_.replace("{AgrClassUUID}", encodeURIComponent("" + agrClassUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAggregatorClassInstancesAllDELETE2(_response);
        });
    }

    protected processAggregatorClassInstancesAllDELETE2(response: Response): Promise<ClassInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData201)) {
                    result201 = [] as any;
                    for (let item of resultData201)
                        result201!.push(ClassInstance.fromJS(item));
                }
                else {
                    result201 = <any>null;
                }
                return result201;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance[]>(null as any);
    }

    /**
     * Create a aggregable class instance not linked to a scene type
     * @param metaClassUUID The uuid of a meta class
     * @param body Created aggregable class instance
     * @return aggregable class instance created successfully
     */
    aggregatorClassInstancesPOST2(metaClassUUID: string, body: ClassInstance): Promise<ClassInstance> {
        let url_ = this.baseUrl + "/instances/aggregatorClassInstances/{MetaClassUUID}";
        if (metaClassUUID === undefined || metaClassUUID === null)
            throw new Error("The parameter 'metaClassUUID' must be defined.");
        url_ = url_.replace("{MetaClassUUID}", encodeURIComponent("" + metaClassUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAggregatorClassInstancesPOST2(_response);
        });
    }

    protected processAggregatorClassInstancesPOST2(response: Response): Promise<ClassInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = ClassInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance>(null as any);
    }

    /**
     * Get the list of all relation class instances of a scene type
     * @param sceneInstanceUUID The uuid of a scene instance
     * @return Successful operation
     */
    relationClassesInstancesAllGET(sceneInstanceUUID: string): Promise<RelationclassInstance[]> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/relationClassesInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRelationClassesInstancesAllGET(_response);
        });
    }

    protected processRelationClassesInstancesAllGET(response: Response): Promise<RelationclassInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(RelationclassInstance.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<RelationclassInstance[]>(null as any);
    }

    /**
     * Create a new relation class instance
     * @param sceneInstanceUUID The uuid of a scene instance
     * @param body Create a new relation class instance
     * @return relation class instance created successfully
     */
    relationClassesInstancesPOST(sceneInstanceUUID: string, body: RelationclassInstance): Promise<RelationclassInstance> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/relationClassesInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRelationClassesInstancesPOST(_response);
        });
    }

    protected processRelationClassesInstancesPOST(response: Response): Promise<RelationclassInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = RelationclassInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<RelationclassInstance>(null as any);
    }

    /**
     * Delete a all relation class instances of a scene instance
     * @param sceneInstanceUUID The uuid of a scene instance
     * @return relation classes instances deleted successfully
     */
    relationClassesInstancesAllDELETE(sceneInstanceUUID: string): Promise<RelationclassInstance[]> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/relationClassesInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRelationClassesInstancesAllDELETE(_response);
        });
    }

    protected processRelationClassesInstancesAllDELETE(response: Response): Promise<RelationclassInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData201)) {
                    result201 = [] as any;
                    for (let item of resultData201)
                        result201!.push(RelationclassInstance.fromJS(item));
                }
                else {
                    result201 = <any>null;
                }
                return result201;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<RelationclassInstance[]>(null as any);
    }

    /**
     * Get an relation class instance
     * @param relClassesUUID The uuid of a relation class instance
     * @return Successful operation
     */
    relationClassesInstancesGET(relClassesUUID: string): Promise<RelationclassInstance> {
        let url_ = this.baseUrl + "/instances/relationClassesInstances/{RelClassesUUID}";
        if (relClassesUUID === undefined || relClassesUUID === null)
            throw new Error("The parameter 'relClassesUUID' must be defined.");
        url_ = url_.replace("{RelClassesUUID}", encodeURIComponent("" + relClassesUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRelationClassesInstancesGET(_response);
        });
    }

    protected processRelationClassesInstancesGET(response: Response): Promise<RelationclassInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = RelationclassInstance.fromJS(resultData200);
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<RelationclassInstance>(null as any);
    }

    /**
     * Update an relation class instance
     * @param relClassesUUID The uuid of a relation class instance
     * @param body Updated relation class instance
     * @return relation class instance updated successfully
     */
    relationClassesInstancesPATCH(relClassesUUID: string, body: ClassInstance): Promise<RelationclassInstance> {
        let url_ = this.baseUrl + "/instances/relationClassesInstances/{RelClassesUUID}";
        if (relClassesUUID === undefined || relClassesUUID === null)
            throw new Error("The parameter 'relClassesUUID' must be defined.");
        url_ = url_.replace("{RelClassesUUID}", encodeURIComponent("" + relClassesUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRelationClassesInstancesPATCH(_response);
        });
    }

    protected processRelationClassesInstancesPATCH(response: Response): Promise<RelationclassInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = RelationclassInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<RelationclassInstance>(null as any);
    }

    /**
     * Delete an relation class instance
     * @param relClassesUUID The uuid of a relation class instance
     * @return relation class instance deleted successfully
     */
    relationClassesInstancesAllDELETE2(relClassesUUID: string): Promise<RelationclassInstance[]> {
        let url_ = this.baseUrl + "/instances/relationClassesInstances/{RelClassesUUID}";
        if (relClassesUUID === undefined || relClassesUUID === null)
            throw new Error("The parameter 'relClassesUUID' must be defined.");
        url_ = url_.replace("{RelClassesUUID}", encodeURIComponent("" + relClassesUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRelationClassesInstancesAllDELETE2(_response);
        });
    }

    protected processRelationClassesInstancesAllDELETE2(response: Response): Promise<RelationclassInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData201)) {
                    result201 = [] as any;
                    for (let item of resultData201)
                        result201!.push(RelationclassInstance.fromJS(item));
                }
                else {
                    result201 = <any>null;
                }
                return result201;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<RelationclassInstance[]>(null as any);
    }

    /**
     * Create a aggregable class instance not linked to a scene type
     * @param metaRelClassUUID The uuid of a meta relation class
     * @param body Created relation class instance
     * @return aggregable class instance created successfully
     */
    relationClassesInstancesPOST2(metaRelClassUUID: string, body: ClassInstance): Promise<ClassInstance> {
        let url_ = this.baseUrl + "/instances/relationClassesInstances/{MetaRelClassUUID}";
        if (metaRelClassUUID === undefined || metaRelClassUUID === null)
            throw new Error("The parameter 'metaRelClassUUID' must be defined.");
        url_ = url_.replace("{MetaRelClassUUID}", encodeURIComponent("" + metaRelClassUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRelationClassesInstancesPOST2(_response);
        });
    }

    protected processRelationClassesInstancesPOST2(response: Response): Promise<ClassInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = ClassInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<ClassInstance>(null as any);
    }

    /**
     * Get the list of all roles instances of a scene type
     * @param sceneInstanceUUID The uuid of a scene instance
     * @return Successful operation
     */
    rolesInstancesAllGET(sceneInstanceUUID: string): Promise<RoleInstance[]> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/rolesInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRolesInstancesAllGET(_response);
        });
    }

    protected processRolesInstancesAllGET(response: Response): Promise<RoleInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(RoleInstance.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<RoleInstance[]>(null as any);
    }

    /**
     * Create a new role instance
     * @param sceneInstanceUUID The uuid of a scene instance
     * @param body Create a new role instance
     * @return role instance created successfully
     */
    rolesInstancesPOST(sceneInstanceUUID: string, body: RoleInstance): Promise<RoleInstance> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/rolesInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRolesInstancesPOST(_response);
        });
    }

    protected processRolesInstancesPOST(response: Response): Promise<RoleInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = RoleInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<RoleInstance>(null as any);
    }

    /**
     * Delete a all role instances of a scene instance
     * @param sceneInstanceUUID The uuid of a scene instance
     * @return role instances deleted successfully
     */
    rolesInstancesAllDELETE(sceneInstanceUUID: string): Promise<RoleInstance[]> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/rolesInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRolesInstancesAllDELETE(_response);
        });
    }

    protected processRolesInstancesAllDELETE(response: Response): Promise<RoleInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData201)) {
                    result201 = [] as any;
                    for (let item of resultData201)
                        result201!.push(RoleInstance.fromJS(item));
                }
                else {
                    result201 = <any>null;
                }
                return result201;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<RoleInstance[]>(null as any);
    }

    /**
     * Get a role instance
     * @param roleUUID The uuid of a role instance
     * @return Successful operation
     */
    rolesInstancesGET(roleUUID: string): Promise<RoleInstance> {
        let url_ = this.baseUrl + "/instances/rolesInstances/{RoleUUID}";
        if (roleUUID === undefined || roleUUID === null)
            throw new Error("The parameter 'roleUUID' must be defined.");
        url_ = url_.replace("{RoleUUID}", encodeURIComponent("" + roleUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRolesInstancesGET(_response);
        });
    }

    protected processRolesInstancesGET(response: Response): Promise<RoleInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = RoleInstance.fromJS(resultData200);
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<RoleInstance>(null as any);
    }

    /**
     * Update a role instance
     * @param roleUUID The uuid of a role instance
     * @param body Updated role instance
     * @return role instance updated successfully
     */
    rolesInstancesPATCH(roleUUID: string, body: RoleInstance): Promise<RoleInstance> {
        let url_ = this.baseUrl + "/instances/rolesInstances/{RoleUUID}";
        if (roleUUID === undefined || roleUUID === null)
            throw new Error("The parameter 'roleUUID' must be defined.");
        url_ = url_.replace("{RoleUUID}", encodeURIComponent("" + roleUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRolesInstancesPATCH(_response);
        });
    }

    protected processRolesInstancesPATCH(response: Response): Promise<RoleInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = RoleInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<RoleInstance>(null as any);
    }

    /**
     * Delete a role instance
     * @param roleUUID The uuid of a role instance
     * @return role instance deleted successfully
     */
    rolesInstancesAllDELETE2(roleUUID: string): Promise<RoleInstance[]> {
        let url_ = this.baseUrl + "/instances/rolesInstances/{RoleUUID}";
        if (roleUUID === undefined || roleUUID === null)
            throw new Error("The parameter 'roleUUID' must be defined.");
        url_ = url_.replace("{RoleUUID}", encodeURIComponent("" + roleUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRolesInstancesAllDELETE2(_response);
        });
    }

    protected processRolesInstancesAllDELETE2(response: Response): Promise<RoleInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData201)) {
                    result201 = [] as any;
                    for (let item of resultData201)
                        result201!.push(RoleInstance.fromJS(item));
                }
                else {
                    result201 = <any>null;
                }
                return result201;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<RoleInstance[]>(null as any);
    }

    /**
     * Create a role instance not linked to a scene type
     * @param metaRoleUUID The uuid of a meta role
     * @param body Created role instance
     * @return role instance created successfully
     */
    rolesInstancesPOST2(metaRoleUUID: string, body: RoleInstance): Promise<RoleInstance> {
        let url_ = this.baseUrl + "/instances/rolesInstances/{MetaRoleUUID}";
        if (metaRoleUUID === undefined || metaRoleUUID === null)
            throw new Error("The parameter 'metaRoleUUID' must be defined.");
        url_ = url_.replace("{MetaRoleUUID}", encodeURIComponent("" + metaRoleUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processRolesInstancesPOST2(_response);
        });
    }

    protected processRolesInstancesPOST2(response: Response): Promise<RoleInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = RoleInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<RoleInstance>(null as any);
    }

    /**
     * Get the list of all port instances of a scene type
     * @param sceneInstanceUUID The uuid of a scene instance
     * @return Successful operation
     */
    portInstancesAllGET(sceneInstanceUUID: string): Promise<PortInstance[]> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/portInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processPortInstancesAllGET(_response);
        });
    }

    protected processPortInstancesAllGET(response: Response): Promise<PortInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(PortInstance.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<PortInstance[]>(null as any);
    }

    /**
     * Create a new port instance
     * @param sceneInstanceUUID The uuid of a scene instance
     * @param body Create a new port instance
     * @return port instance created successfully
     */
    portInstancesPOST(sceneInstanceUUID: string, body: PortInstance): Promise<PortInstance> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/portInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processPortInstancesPOST(_response);
        });
    }

    protected processPortInstancesPOST(response: Response): Promise<PortInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = PortInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<PortInstance>(null as any);
    }

    /**
     * Delete a all port instances of a scene instance
     * @param sceneInstanceUUID The uuid of a scene instance
     * @return port instances deleted successfully
     */
    portInstancesAllDELETE(sceneInstanceUUID: string): Promise<PortInstance[]> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/portInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processPortInstancesAllDELETE(_response);
        });
    }

    protected processPortInstancesAllDELETE(response: Response): Promise<PortInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData201)) {
                    result201 = [] as any;
                    for (let item of resultData201)
                        result201!.push(PortInstance.fromJS(item));
                }
                else {
                    result201 = <any>null;
                }
                return result201;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<PortInstance[]>(null as any);
    }

    /**
     * Get a port instance
     * @param portUUID The uuid of a port instance
     * @return Successful operation
     */
    portInstancesGET(portUUID: string): Promise<PortInstance> {
        let url_ = this.baseUrl + "/instances/portInstances/{PortUUID}";
        if (portUUID === undefined || portUUID === null)
            throw new Error("The parameter 'portUUID' must be defined.");
        url_ = url_.replace("{PortUUID}", encodeURIComponent("" + portUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processPortInstancesGET(_response);
        });
    }

    protected processPortInstancesGET(response: Response): Promise<PortInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = PortInstance.fromJS(resultData200);
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<PortInstance>(null as any);
    }

    /**
     * Update a port instance
     * @param portUUID The uuid of a port instance
     * @param body Updated port instance
     * @return port instance updated successfully
     */
    portInstancesPATCH(portUUID: string, body: PortInstance): Promise<PortInstance> {
        let url_ = this.baseUrl + "/instances/portInstances/{PortUUID}";
        if (portUUID === undefined || portUUID === null)
            throw new Error("The parameter 'portUUID' must be defined.");
        url_ = url_.replace("{PortUUID}", encodeURIComponent("" + portUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processPortInstancesPATCH(_response);
        });
    }

    protected processPortInstancesPATCH(response: Response): Promise<PortInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = PortInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<PortInstance>(null as any);
    }

    /**
     * Delete a port instance
     * @param portUUID The uuid of a port instance
     * @return port instance deleted successfully
     */
    portInstancesAllDELETE2(portUUID: string): Promise<PortInstance[]> {
        let url_ = this.baseUrl + "/instances/portInstances/{PortUUID}";
        if (portUUID === undefined || portUUID === null)
            throw new Error("The parameter 'portUUID' must be defined.");
        url_ = url_.replace("{PortUUID}", encodeURIComponent("" + portUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processPortInstancesAllDELETE2(_response);
        });
    }

    protected processPortInstancesAllDELETE2(response: Response): Promise<PortInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData201)) {
                    result201 = [] as any;
                    for (let item of resultData201)
                        result201!.push(PortInstance.fromJS(item));
                }
                else {
                    result201 = <any>null;
                }
                return result201;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<PortInstance[]>(null as any);
    }

    /**
     * Create a port instance not linked to a scene type
     * @param metaPortUUID The uuid of a meta port
     * @param body Created port instance
     * @return port instance created successfully
     */
    portInstancesPOST2(metaPortUUID: string, body: PortInstance): Promise<PortInstance> {
        let url_ = this.baseUrl + "/instances/portInstances/{MetaPortUUID}";
        if (metaPortUUID === undefined || metaPortUUID === null)
            throw new Error("The parameter 'metaPortUUID' must be defined.");
        url_ = url_.replace("{MetaPortUUID}", encodeURIComponent("" + metaPortUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processPortInstancesPOST2(_response);
        });
    }

    protected processPortInstancesPOST2(response: Response): Promise<PortInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = PortInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<PortInstance>(null as any);
    }

    /**
     * Get the list of all attribute instances of a scene type
     * @param sceneInstanceUUID The uuid of a scene instance
     * @return Successful operation
     */
    attributeInstancesAllGET(sceneInstanceUUID: string): Promise<AttributeInstance[]> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/attributeInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributeInstancesAllGET(_response);
        });
    }

    protected processAttributeInstancesAllGET(response: Response): Promise<AttributeInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(AttributeInstance.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<AttributeInstance[]>(null as any);
    }

    /**
     * Create a new attribute instance
     * @param sceneInstanceUUID The uuid of a scene instance
     * @param body Create a new attribute instance
     * @return attribute instance created successfully
     */
    attributeInstancesPOST(sceneInstanceUUID: string, body: AttributeInstance): Promise<AttributeInstance> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/attributeInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributeInstancesPOST(_response);
        });
    }

    protected processAttributeInstancesPOST(response: Response): Promise<AttributeInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = AttributeInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<AttributeInstance>(null as any);
    }

    /**
     * Delete a all attribute instances of a scene instance
     * @param sceneInstanceUUID The uuid of a scene instance
     * @return attribute instances deleted successfully
     */
    attributeInstancesAllDELETE(sceneInstanceUUID: string): Promise<AttributeInstance[]> {
        let url_ = this.baseUrl + "/instances/sceneInstances/{SceneInstanceUUID}/attributeInstances";
        if (sceneInstanceUUID === undefined || sceneInstanceUUID === null)
            throw new Error("The parameter 'sceneInstanceUUID' must be defined.");
        url_ = url_.replace("{SceneInstanceUUID}", encodeURIComponent("" + sceneInstanceUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributeInstancesAllDELETE(_response);
        });
    }

    protected processAttributeInstancesAllDELETE(response: Response): Promise<AttributeInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData201)) {
                    result201 = [] as any;
                    for (let item of resultData201)
                        result201!.push(AttributeInstance.fromJS(item));
                }
                else {
                    result201 = <any>null;
                }
                return result201;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<AttributeInstance[]>(null as any);
    }

    /**
     * Get a attribute instance
     * @param attributeUUID The uuid of a attribute instance
     * @return Successful operation
     */
    attributeInstancesGET(attributeUUID: string): Promise<AttributeInstance> {
        let url_ = this.baseUrl + "/instances/attributeInstances/{AttributeUUID}";
        if (attributeUUID === undefined || attributeUUID === null)
            throw new Error("The parameter 'attributeUUID' must be defined.");
        url_ = url_.replace("{AttributeUUID}", encodeURIComponent("" + attributeUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributeInstancesGET(_response);
        });
    }

    protected processAttributeInstancesGET(response: Response): Promise<AttributeInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result200 = AttributeInstance.fromJS(resultData200);
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<AttributeInstance>(null as any);
    }

    /**
     * Update a attribute instance
     * @param attributeUUID The uuid of a attribute instance
     * @param body Updated attribute instance
     * @return attribute instance updated successfully
     */
    attributeInstancesPATCH(attributeUUID: string, body: AttributeInstance): Promise<AttributeInstance> {
        let url_ = this.baseUrl + "/instances/attributeInstances/{AttributeUUID}";
        if (attributeUUID === undefined || attributeUUID === null)
            throw new Error("The parameter 'attributeUUID' must be defined.");
        url_ = url_.replace("{AttributeUUID}", encodeURIComponent("" + attributeUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributeInstancesPATCH(_response);
        });
    }

    protected processAttributeInstancesPATCH(response: Response): Promise<AttributeInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = AttributeInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<AttributeInstance>(null as any);
    }

    /**
     * Delete a attribute instance
     * @param attributeUUID The uuid of a attribute instance
     * @return attribute instance deleted successfully
     */
    attributeInstancesAllDELETE2(attributeUUID: string): Promise<AttributeInstance[]> {
        let url_ = this.baseUrl + "/instances/attributeInstances/{AttributeUUID}";
        if (attributeUUID === undefined || attributeUUID === null)
            throw new Error("The parameter 'attributeUUID' must be defined.");
        url_ = url_.replace("{AttributeUUID}", encodeURIComponent("" + attributeUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributeInstancesAllDELETE2(_response);
        });
    }

    protected processAttributeInstancesAllDELETE2(response: Response): Promise<AttributeInstance[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData201)) {
                    result201 = [] as any;
                    for (let item of resultData201)
                        result201!.push(AttributeInstance.fromJS(item));
                }
                else {
                    result201 = <any>null;
                }
                return result201;
            });
        } else if (status === 400) {
            return response.text().then((_responseText) => {
                let result400: any = null;
                let resultData400 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result400 = ErrorDto.fromJS(resultData400);
                return throwException("Invalid payload supplied", status, _responseText, _headers, result400);
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<AttributeInstance[]>(null as any);
    }

    /**
     * Create a attribute instance not linked to a scene type
     * @param metaAttributeUUID The uuid of a meta attribute
     * @param body Created attribute instance
     * @return attribute instance created successfully
     */
    attributeInstancesPOST2(metaAttributeUUID: string, body: AttributeInstance): Promise<AttributeInstance> {
        let url_ = this.baseUrl + "/instances/attributeInstances/{MetaAttributeUUID}";
        if (metaAttributeUUID === undefined || metaAttributeUUID === null)
            throw new Error("The parameter 'metaAttributeUUID' must be defined.");
        url_ = url_.replace("{MetaAttributeUUID}", encodeURIComponent("" + metaAttributeUUID));
        url_ = url_.replace(/[?&]$/, "");

        const content_ = JSON.stringify(body);

        let options_: RequestInit = {
            body: content_,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributeInstancesPOST2(_response);
        });
    }

    protected processAttributeInstancesPOST2(response: Response): Promise<AttributeInstance> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 201) {
            return response.text().then((_responseText) => {
                let result201: any = null;
                let resultData201 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                result201 = AttributeInstance.fromJS(resultData201);
                return result201;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<AttributeInstance>(null as any);
    }

    /**
     * Get the list of all attribute types of a attribute instance
     * @param attributeUUID The uuid of a attribute instance
     * @return Successful operation
     */
    attributeTypes(attributeUUID: string): Promise<AttributeType[]> {
        let url_ = this.baseUrl + "/instances/attributeInstances/{AttributeUUID}/attributeTypes";
        if (attributeUUID === undefined || attributeUUID === null)
            throw new Error("The parameter 'attributeUUID' must be defined.");
        url_ = url_.replace("{AttributeUUID}", encodeURIComponent("" + attributeUUID));
        url_ = url_.replace(/[?&]$/, "");

        let options_: RequestInit = {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "authorization": "Bearer " + this.globalObjectInstance.accessToken
            }
        };

        this.logger.log('API call on ' + url_, 'api')
        return this.http.fetch(url_, options_).then((_response: Response) => {
            return this.processAttributeTypes(_response);
        });
    }

    protected processAttributeTypes(response: Response): Promise<AttributeType[]> {
        const status = response.status;
        let _headers: any = {}; if (response.headers && response.headers.forEach) { response.headers.forEach((v: any, k: any) => _headers[k] = v); };
        if (status === 200) {
            return response.text().then((_responseText) => {
                let result200: any = null;
                let resultData200 = _responseText === "" ? null : JSON.parse(_responseText, this.jsonParseReviver);
                if (Array.isArray(resultData200)) {
                    result200 = [] as any;
                    for (let item of resultData200)
                        result200!.push(AttributeType.fromJS(item));
                }
                else {
                    result200 = <any>null;
                }
                return result200;
            });
        } else if (status !== 200 && status !== 204) {
            return response.text().then((_responseText) => {
                return throwException("An unexpected server error occurred.", status, _responseText, _headers);
            });
        }
        return Promise.resolve<AttributeType[]>(null as any);
    }

    getFileUploadbyUUIDUrl(AttributeInstanceValue: string): string {
        let url_ = this.baseUrl + "/files/{AttributeInstanceValue}";
        if (AttributeInstanceValue === undefined || AttributeInstanceValue === null)
            throw new Error("The parameter 'AttributeInstanceValue' must be defined.");
        url_ = url_.replace("{AttributeInstanceValue}", encodeURIComponent("" + AttributeInstanceValue));
        url_ = url_.replace(/[?&]$/, "");
        return url_;
    }

    getFileUploadUrl(): string {
        let url_ = this.baseUrl + "/files";
        url_ = url_.replace(/[?&]$/, "");
        return url_;
    }
}

class ApiException extends Error {
    override message: string;
    status: number;
    response: string;
    headers: { [key: string]: any; };
    result: any;

    constructor(message: string, status: number, response: string, headers: { [key: string]: any; }, result: any) {
        super();

        this.message = message;
        this.status = status;
        this.response = response;
        this.headers = headers;
        this.result = result;
    }

    protected isApiException = true;

    static isApiException(obj: any): obj is ApiException {
        return obj.isApiException === true;
    }
}

function throwException(message: string, status: number, response: string, headers: { [key: string]: any; }, result?: any): any {
    if (result !== null && result !== undefined)
        throw result;
    else
        throw new ApiException(message, status, response, headers, null);
}

interface IErrorDto {
    error?: string;
}

class ErrorDto implements IErrorDto {
    error?: string;

    constructor(data?: IErrorDto) {
        if (data) {
            for (var property in data) {
                if (data.hasOwnProperty(property))
                    (<any>this)[property] = (<any>data)[property];
            }
        }
    }

    init(_data?: any) {
        if (_data) {
            this.error = _data["error"];
        }
    }

    static fromJS(data: any): ErrorDto {
        data = typeof data === 'object' ? data : {};
        let result = new ErrorDto();
        result.init(data);
        return result;
    }

    toJSON(data?: any) {
        data = typeof data === 'object' ? data : {};
        data["error"] = this.error;
        return data;
    }
}
