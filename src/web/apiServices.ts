import remoteObject, { addProperty, buildEventProperty } from "../utils/networking/broadCastProperies";

buildEventProperty({
    type: 'string',
    name: 'username',
    ns: '',
    get() {
        return prompt("Username");
    }
});
buildEventProperty({
    type: 'string',
    name: 'pwd',
    ns: '',
    get() {
        return prompt("Password");
    }
});