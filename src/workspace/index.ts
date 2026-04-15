
import { AsyncEnv } from '../utils';
import { erpQueue } from '../utils/networking/AutoHTTP';
import Orchestrator from './Orchestrator';


export * from './config';


export * from './Orchestrator';
import "./routers/dbStream";
export default Orchestrator;

(self as any)['testERP'] = (async () => {
    const env = await AsyncEnv();
    console.log(env.API_URL);

    const products = await erpQueue.erpCall({ route: "/products", method: "GET", encrypt: true });
    debugger;
})();