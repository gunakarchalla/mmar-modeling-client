import { EventAggregator, bindable } from 'aurelia';
import { GlobalDefinition } from 'resources/global_definitions';
import { FetchHelper } from './../../resources/services/fetchHelper';
import {jwtDecode} from 'jwt-decode';

interface JwtPayload {
    exp?: number;
  }

export class UserManagement {
    @bindable private UserManagement: any;
    private username: string = process.env.USERNAME || '';
    private password: string = process.env.PASSWORD || '';
    private errorMessage: string | void;
    private token: string;

    constructor(
        private fetchHelper: FetchHelper,
        private globalObjectInstance: GlobalDefinition,
        private eventAggregator: EventAggregator
    ) { }

    /**
     * Lifecycle hook that is called when the component is attached to the DOM.
     * It retrieves the JWT token from local storage and initializes API metadata if the token exists and is not expired.
     * If the token does not exist, it opens the UserManagement dialog.
     */
    async attached() {
        // 1-second delay to allow the dialog to open
        setTimeout(async () => {
            this.token = localStorage.getItem("jwtToken");
            //check if token is expired
            let isExpired = true;
            this.token ? isExpired = await this.isJwtExpired(this.token) : isExpired = true;
            // remove jwtToken from local storage if it is expired
            if (isExpired) {
                localStorage.removeItem("jwtToken");
            }

            if (this.token && isExpired == false) {
                this.initAPIMetadata();
            } else {
                this.UserManagement.open();
            }
        }, 1000);
    }

    /**
     * Handles user login by sending the username and password to the login API.
     * If login is successful, it retrieves and stores the token and initializes API metadata.
     * If login fails, it sets an error message and reopens the UserManagement dialog.
     */
    async login(): Promise<void> {
        try {
            this.token = await this.fetchHelper.loginPost({
                username: this.username,
                password: this.password
            });
        } catch (error) {
            this.errorMessage = "Invalid username or password";
            this.UserManagement.open();
            return;
        }

        // Check if the token exists (a valid JWT usually starts with 'ey')
        if (this.token) {
            await this.initAPIMetadata();
        } else {
            this.errorMessage = "Failed to retrieve a valid token";
            this.UserManagement.open();
        }
    }

    /**
     * Initializes API metadata by storing the JWT token in local storage,
     * setting the global access token, configuring the HTTP client,
     * and publishing a login event.
     */
    async initAPIMetadata() {
        this.errorMessage = 'Success';
        localStorage.setItem("jwtToken", this.token);
        this.globalObjectInstance.accessToken = this.token;
        this.fetchHelper.setUpHttpClient();
        this.eventAggregator.publish('login', true);
    }

    // /**
    //  * Checks if a JWT token is expired.
    //  * @param token - The JWT token to check.
    //  * @returns A promise that resolves to a boolean indicating if the token is expired.
    //  */
    async isJwtExpired(token: string): Promise<boolean> {
        const decoded: JwtPayload = jwtDecode<JwtPayload>(token);
        if (!decoded.exp) {
            // If the token doesn't have an exp claim, consider it invalid or not expired
            return false;
        }

        // Current time in seconds since the epoch
        const currentTime = Math.floor(Date.now() / 1000);

        // Check if the token is expired
        return currentTime > decoded.exp;
    }

}
