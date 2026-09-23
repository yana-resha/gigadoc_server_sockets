const { buildParamsFixture, countDeviations } = require("../fixtures/params");
const { randomUUID } = require("node:crypto");

const MEASUREMENT_PLAN = ["skin", "heart_and_vessels", "vision"];

const QR_SVG =
  '<svg xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg" id="map" viewBox="0 0 231 231" width="1000" height="1000" data-dot="7"><rect x="0" y="0" height="231" width="231" fill="#ffffff"/><defs/><g fill="#000000"><rect x="28" y="182" width="21" height="21" transform="rotate(-90,38.5,192.5)"/><path clip-rule="evenodd" class="svgeye" d="M 14 168v 49h 49v -49zM 21 175h 35v 35h -35z" transform="rotate(-90,38.5,192.5)"/><rect x="182" y="28" width="21" height="21" transform="rotate(90,192.5,38.5)"/><path clip-rule="evenodd" class="svgeye" d="M 168 14v 49h 49v -49zM 175 21h 35v 35h -35z" transform="rotate(90,192.5,38.5)"/><rect x="28" y="28" width="21" height="21" transform="rotate(0,38.5,38.5)"/><path clip-rule="evenodd" class="svgeye" d="M 14 14v 49h 49v -49zM 21 21h 35v 35h -35z" transform="rotate(0,38.5,38.5)"/><rect x="84" y="14" width="7" height="7" transform="rotate(0,87.5,17.5)"/><rect x="91" y="14" width="7" height="7" transform="rotate(0,94.5,17.5)"/><rect x="119" y="14" width="7" height="7" transform="rotate(0,122.5,17.5)"/><rect x="140" y="14" width="7" height="7" transform="rotate(0,143.5,17.5)"/><rect x="154" y="14" width="7" height="7" transform="rotate(0,157.5,17.5)"/><rect x="70" y="21" width="7" height="7" transform="rotate(0,73.5,24.5)"/><rect x="77" y="21" width="7" height="7" transform="rotate(0,80.5,24.5)"/><rect x="91" y="21" width="7" height="7" transform="rotate(0,94.5,24.5)"/><rect x="98" y="21" width="7" height="7" transform="rotate(0,101.5,24.5)"/><rect x="126" y="21" width="7" height="7" transform="rotate(0,129.5,24.5)"/><rect x="133" y="21" width="7" height="7" transform="rotate(0,136.5,24.5)"/><rect x="147" y="21" width="7" height="7" transform="rotate(0,150.5,24.5)"/><rect x="154" y="21" width="7" height="7" transform="rotate(0,157.5,24.5)"/><rect x="70" y="28" width="7" height="7" transform="rotate(0,73.5,31.5)"/><rect x="98" y="28" width="7" height="7" transform="rotate(0,101.5,31.5)"/><rect x="105" y="28" width="7" height="7" transform="rotate(0,108.5,31.5)"/><rect x="133" y="28" width="7" height="7" transform="rotate(0,136.5,31.5)"/><rect x="154" y="28" width="7" height="7" transform="rotate(0,157.5,31.5)"/><rect x="77" y="35" width="7" height="7" transform="rotate(0,80.5,38.5)"/><rect x="98" y="35" width="7" height="7" transform="rotate(0,101.5,38.5)"/><rect x="119" y="35" width="7" height="7" transform="rotate(0,122.5,38.5)"/><rect x="133" y="35" width="7" height="7" transform="rotate(0,136.5,38.5)"/><rect x="140" y="35" width="7" height="7" transform="rotate(0,143.5,38.5)"/><rect x="147" y="35" width="7" height="7" transform="rotate(0,150.5,38.5)"/><rect x="154" y="35" width="7" height="7" transform="rotate(0,157.5,38.5)"/><rect x="77" y="42" width="7" height="7" transform="rotate(0,80.5,45.5)"/><rect x="84" y="42" width="7" height="7" transform="rotate(0,87.5,45.5)"/><rect x="91" y="42" width="7" height="7" transform="rotate(0,94.5,45.5)"/><rect x="105" y="42" width="7" height="7" transform="rotate(0,108.5,45.5)"/><rect x="112" y="42" width="7" height="7" transform="rotate(0,115.5,45.5)"/><rect x="133" y="42" width="7" height="7" transform="rotate(0,136.5,45.5)"/><rect x="140" y="42" width="7" height="7" transform="rotate(0,143.5,45.5)"/><rect x="77" y="49" width="7" height="7" transform="rotate(0,80.5,52.5)"/><rect x="91" y="49" width="7" height="7" transform="rotate(0,94.5,52.5)"/><rect x="105" y="49" width="7" height="7" transform="rotate(0,108.5,52.5)"/><rect x="126" y="49" width="7" height="7" transform="rotate(0,129.5,52.5)"/><rect x="70" y="56" width="7" height="7" transform="rotate(0,73.5,59.5)"/><rect x="84" y="56" width="7" height="7" transform="rotate(0,87.5,59.5)"/><rect x="98" y="56" width="7" height="7" transform="rotate(0,101.5,59.5)"/><rect x="112" y="56" width="7" height="7" transform="rotate(0,115.5,59.5)"/><rect x="126" y="56" width="7" height="7" transform="rotate(0,129.5,59.5)"/><rect x="140" y="56" width="7" height="7" transform="rotate(0,143.5,59.5)"/><rect x="154" y="56" width="7" height="7" transform="rotate(0,157.5,59.5)"/><rect x="77" y="63" width="7" height="7" transform="rotate(0,80.5,66.5)"/><rect x="91" y="63" width="7" height="7" transform="rotate(0,94.5,66.5)"/><rect x="98" y="63" width="7" height="7" transform="rotate(0,101.5,66.5)"/><rect x="126" y="63" width="7" height="7" transform="rotate(0,129.5,66.5)"/><rect x="133" y="63" width="7" height="7" transform="rotate(0,136.5,66.5)"/><rect x="140" y="63" width="7" height="7" transform="rotate(0,143.5,66.5)"/><rect x="154" y="63" width="7" height="7" transform="rotate(0,157.5,66.5)"/><rect x="21" y="70" width="7" height="7" transform="rotate(0,24.5,73.5)"/><rect x="28" y="70" width="7" height="7" transform="rotate(0,31.5,73.5)"/><rect x="35" y="70" width="7" height="7" transform="rotate(0,38.5,73.5)"/><rect x="49" y="70" width="7" height="7" transform="rotate(0,52.5,73.5)"/><rect x="56" y="70" width="7" height="7" transform="rotate(0,59.5,73.5)"/><rect x="112" y="70" width="7" height="7" transform="rotate(0,115.5,73.5)"/><rect x="126" y="70" width="7" height="7" transform="rotate(0,129.5,73.5)"/><rect x="147" y="70" width="7" height="7" transform="rotate(0,150.5,73.5)"/><rect x="154" y="70" width="7" height="7" transform="rotate(0,157.5,73.5)"/><rect x="196" y="70" width="7" height="7" transform="rotate(0,199.5,73.5)"/><rect x="203" y="70" width="7" height="7" transform="rotate(0,206.5,73.5)"/><rect x="28" y="77" width="7" height="7" transform="rotate(0,31.5,80.5)"/><rect x="42" y="77" width="7" height="7" transform="rotate(0,45.5,80.5)"/><rect x="77" y="77" width="7" height="7" transform="rotate(0,80.5,80.5)"/><rect x="84" y="77" width="7" height="7" transform="rotate(0,87.5,80.5)"/><rect x="91" y="77" width="7" height="7" transform="rotate(0,94.5,80.5)"/><rect x="112" y="77" width="7" height="7" transform="rotate(0,115.5,80.5)"/><rect x="133" y="77" width="7" height="7" transform="rotate(0,136.5,80.5)"/><rect x="168" y="77" width="7" height="7" transform="rotate(0,171.5,80.5)"/><rect x="203" y="77" width="7" height="7" transform="rotate(0,206.5,80.5)"/><rect x="210" y="77" width="7" height="7" transform="rotate(0,213.5,80.5)"/><rect x="14" y="84" width="7" height="7" transform="rotate(0,17.5,87.5)"/><rect x="21" y="84" width="7" height="7" transform="rotate(0,24.5,87.5)"/><rect x="35" y="84" width="7" height="7" transform="rotate(0,38.5,87.5)"/><rect x="49" y="84" width="7" height="7" transform="rotate(0,52.5,87.5)"/><rect x="56" y="84" width="7" height="7" transform="rotate(0,59.5,87.5)"/><rect x="63" y="84" width="7" height="7" transform="rotate(0,66.5,87.5)"/><rect x="77" y="84" width="7" height="7" transform="rotate(0,80.5,87.5)"/><rect x="98" y="84" width="7" height="7" transform="rotate(0,101.5,87.5)"/><rect x="105" y="84" width="7" height="7" transform="rotate(0,108.5,87.5)"/><rect x="119" y="84" width="7" height="7" transform="rotate(0,122.5,87.5)"/><rect x="126" y="84" width="7" height="7" transform="rotate(0,129.5,87.5)"/><rect x="133" y="84" width="7" height="7" transform="rotate(0,136.5,87.5)"/><rect x="140" y="84" width="7" height="7" transform="rotate(0,143.5,87.5)"/><rect x="161" y="84" width="7" height="7" transform="rotate(0,164.5,87.5)"/><rect x="182" y="84" width="7" height="7" transform="rotate(0,185.5,87.5)"/><rect x="196" y="84" width="7" height="7" transform="rotate(0,199.5,87.5)"/><rect x="210" y="84" width="7" height="7" transform="rotate(0,213.5,87.5)"/><rect x="14" y="91" width="7" height="7" transform="rotate(0,17.5,94.5)"/><rect x="49" y="91" width="7" height="7" transform="rotate(0,52.5,94.5)"/><rect x="70" y="91" width="7" height="7" transform="rotate(0,73.5,94.5)"/><rect x="84" y="91" width="7" height="7" transform="rotate(0,87.5,94.5)"/><rect x="105" y="91" width="7" height="7" transform="rotate(0,108.5,94.5)"/><rect x="112" y="91" width="7" height="7" transform="rotate(0,115.5,94.5)"/><rect x="126" y="91" width="7" height="7" transform="rotate(0,129.5,94.5)"/><rect x="133" y="91" width="7" height="7" transform="rotate(0,136.5,94.5)"/><rect x="140" y="91" width="7" height="7" transform="rotate(0,143.5,94.5)"/><rect x="147" y="91" width="7" height="7" transform="rotate(0,150.5,94.5)"/><rect x="161" y="91" width="7" height="7" transform="rotate(0,164.5,94.5)"/><rect x="168" y="91" width="7" height="7" transform="rotate(0,171.5,94.5)"/><rect x="175" y="91" width="7" height="7" transform="rotate(0,178.5,94.5)"/><rect x="182" y="91" width="7" height="7" transform="rotate(0,185.5,94.5)"/><rect x="196" y="91" width="7" height="7" transform="rotate(0,199.5,94.5)"/><rect x="210" y="91" width="7" height="7" transform="rotate(0,213.5,94.5)"/><rect x="14" y="98" width="7" height="7" transform="rotate(0,17.5,101.5)"/><rect x="28" y="98" width="7" height="7" transform="rotate(0,31.5,101.5)"/><rect x="56" y="98" width="7" height="7" transform="rotate(0,59.5,101.5)"/><rect x="70" y="98" width="7" height="7" transform="rotate(0,73.5,101.5)"/><rect x="77" y="98" width="7" height="7" transform="rotate(0,80.5,101.5)"/><rect x="84" y="98" width="7" height="7" transform="rotate(0,87.5,101.5)"/><rect x="91" y="98" width="7" height="7" transform="rotate(0,94.5,101.5)"/><rect x="119" y="98" width="7" height="7" transform="rotate(0,122.5,101.5)"/><rect x="126" y="98" width="7" height="7" transform="rotate(0,129.5,101.5)"/><rect x="154" y="98" width="7" height="7" transform="rotate(0,157.5,101.5)"/><rect x="168" y="98" width="7" height="7" transform="rotate(0,171.5,101.5)"/><rect x="175" y="98" width="7" height="7" transform="rotate(0,178.5,101.5)"/><rect x="196" y="98" width="7" height="7" transform="rotate(0,199.5,101.5)"/><rect x="203" y="98" width="7" height="7" transform="rotate(0,206.5,101.5)"/><rect x="21" y="105" width="7" height="7" transform="rotate(0,24.5,108.5)"/><rect x="35" y="105" width="7" height="7" transform="rotate(0,38.5,108.5)"/><rect x="42" y="105" width="7" height="7" transform="rotate(0,45.5,108.5)"/><rect x="77" y="105" width="7" height="7" transform="rotate(0,80.5,108.5)"/><rect x="91" y="105" width="7" height="7" transform="rotate(0,94.5,108.5)"/><rect x="119" y="105" width="7" height="7" transform="rotate(0,122.5,108.5)"/><rect x="126" y="105" width="7" height="7" transform="rotate(0,129.5,108.5)"/><rect x="140" y="105" width="7" height="7" transform="rotate(0,143.5,108.5)"/><rect x="147" y="105" width="7" height="7" transform="rotate(0,150.5,108.5)"/><rect x="154" y="105" width="7" height="7" transform="rotate(0,157.5,108.5)"/><rect x="161" y="105" width="7" height="7" transform="rotate(0,164.5,108.5)"/><rect x="175" y="105" width="7" height="7" transform="rotate(0,178.5,108.5)"/><rect x="182" y="105" width="7" height="7" transform="rotate(0,185.5,108.5)"/><rect x="196" y="105" width="7" height="7" transform="rotate(0,199.5,108.5)"/><rect x="210" y="105" width="7" height="7" transform="rotate(0,213.5,108.5)"/><rect x="28" y="112" width="7" height="7" transform="rotate(0,31.5,115.5)"/><rect x="35" y="112" width="7" height="7" transform="rotate(0,38.5,115.5)"/><rect x="49" y="112" width="7" height="7" transform="rotate(0,52.5,115.5)"/><rect x="56" y="112" width="7" height="7" transform="rotate(0,59.5,115.5)"/><rect x="70" y="112" width="7" height="7" transform="rotate(0,73.5,115.5)"/><rect x="77" y="112" width="7" height="7" transform="rotate(0,80.5,115.5)"/><rect x="84" y="112" width="7" height="7" transform="rotate(0,87.5,115.5)"/><rect x="105" y="112" width="7" height="7" transform="rotate(0,108.5,115.5)"/><rect x="112" y="112" width="7" height="7" transform="rotate(0,115.5,115.5)"/><rect x="119" y="112" width="7" height="7" transform="rotate(0,122.5,115.5)"/><rect x="133" y="112" width="7" height="7" transform="rotate(0,136.5,115.5)"/><rect x="140" y="112" width="7" height="7" transform="rotate(0,143.5,115.5)"/><rect x="210" y="112" width="7" height="7" transform="rotate(0,213.5,115.5)"/><rect x="14" y="119" width="7" height="7" transform="rotate(0,17.5,122.5)"/><rect x="28" y="119" width="7" height="7" transform="rotate(0,31.5,122.5)"/><rect x="35" y="119" width="7" height="7" transform="rotate(0,38.5,122.5)"/><rect x="42" y="119" width="7" height="7" transform="rotate(0,45.5,122.5)"/><rect x="49" y="119" width="7" height="7" transform="rotate(0,52.5,122.5)"/><rect x="63" y="119" width="7" height="7" transform="rotate(0,66.5,122.5)"/><rect x="70" y="119" width="7" height="7" transform="rotate(0,73.5,122.5)"/><rect x="77" y="119" width="7" height="7" transform="rotate(0,80.5,122.5)"/><rect x="84" y="119" width="7" height="7" transform="rotate(0,87.5,122.5)"/><rect x="98" y="119" width="7" height="7" transform="rotate(0,101.5,122.5)"/><rect x="105" y="119" width="7" height="7" transform="rotate(0,108.5,122.5)"/><rect x="112" y="119" width="7" height="7" transform="rotate(0,115.5,122.5)"/><rect x="133" y="119" width="7" height="7" transform="rotate(0,136.5,122.5)"/><rect x="140" y="119" width="7" height="7" transform="rotate(0,143.5,122.5)"/><rect x="161" y="119" width="7" height="7" transform="rotate(0,164.5,122.5)"/><rect x="182" y="119" width="7" height="7" transform="rotate(0,185.5,122.5)"/><rect x="189" y="119" width="7" height="7" transform="rotate(0,192.5,122.5)"/><rect x="196" y="119" width="7" height="7" transform="rotate(0,199.5,122.5)"/><rect x="21" y="126" width="7" height="7" transform="rotate(0,24.5,129.5)"/><rect x="56" y="126" width="7" height="7" transform="rotate(0,59.5,129.5)"/><rect x="70" y="126" width="7" height="7" transform="rotate(0,73.5,129.5)"/><rect x="77" y="126" width="7" height="7" transform="rotate(0,80.5,129.5)"/><rect x="105" y="126" width="7" height="7" transform="rotate(0,108.5,129.5)"/><rect x="126" y="126" width="7" height="7" transform="rotate(0,129.5,129.5)"/><rect x="133" y="126" width="7" height="7" transform="rotate(0,136.5,129.5)"/><rect x="140" y="126" width="7" height="7" transform="rotate(0,143.5,129.5)"/><rect x="154" y="126" width="7" height="7" transform="rotate(0,157.5,129.5)"/><rect x="168" y="126" width="7" height="7" transform="rotate(0,171.5,129.5)"/><rect x="175" y="126" width="7" height="7" transform="rotate(0,178.5,129.5)"/><rect x="182" y="126" width="7" height="7" transform="rotate(0,185.5,129.5)"/><rect x="189" y="126" width="7" height="7" transform="rotate(0,192.5,129.5)"/><rect x="196" y="126" width="7" height="7" transform="rotate(0,199.5,129.5)"/><rect x="21" y="133" width="7" height="7" transform="rotate(0,24.5,136.5)"/><rect x="28" y="133" width="7" height="7" transform="rotate(0,31.5,136.5)"/><rect x="35" y="133" width="7" height="7" transform="rotate(0,38.5,136.5)"/><rect x="49" y="133" width="7" height="7" transform="rotate(0,52.5,136.5)"/><rect x="63" y="133" width="7" height="7" transform="rotate(0,66.5,136.5)"/><rect x="70" y="133" width="7" height="7" transform="rotate(0,73.5,136.5)"/><rect x="91" y="133" width="7" height="7" transform="rotate(0,94.5,136.5)"/><rect x="98" y="133" width="7" height="7" transform="rotate(0,101.5,136.5)"/><rect x="105" y="133" width="7" height="7" transform="rotate(0,108.5,136.5)"/><rect x="126" y="133" width="7" height="7" transform="rotate(0,129.5,136.5)"/><rect x="147" y="133" width="7" height="7" transform="rotate(0,150.5,136.5)"/><rect x="154" y="133" width="7" height="7" transform="rotate(0,157.5,136.5)"/><rect x="168" y="133" width="7" height="7" transform="rotate(0,171.5,136.5)"/><rect x="175" y="133" width="7" height="7" transform="rotate(0,178.5,136.5)"/><rect x="182" y="133" width="7" height="7" transform="rotate(0,185.5,136.5)"/><rect x="189" y="133" width="7" height="7" transform="rotate(0,192.5,136.5)"/><rect x="203" y="133" width="7" height="7" transform="rotate(0,206.5,136.5)"/><rect x="210" y="133" width="7" height="7" transform="rotate(0,213.5,136.5)"/><rect x="14" y="140" width="7" height="7" transform="rotate(0,17.5,143.5)"/><rect x="28" y="140" width="7" height="7" transform="rotate(0,31.5,143.5)"/><rect x="35" y="140" width="7" height="7" transform="rotate(0,38.5,143.5)"/><rect x="56" y="140" width="7" height="7" transform="rotate(0,59.5,143.5)"/><rect x="63" y="140" width="7" height="7" transform="rotate(0,66.5,143.5)"/><rect x="70" y="140" width="7" height="7" transform="rotate(0,73.5,143.5)"/><rect x="77" y="140" width="7" height="7" transform="rotate(0,80.5,143.5)"/><rect x="84" y="140" width="7" height="7" transform="rotate(0,87.5,143.5)"/><rect x="105" y="140" width="7" height="7" transform="rotate(0,108.5,143.5)"/><rect x="119" y="140" width="7" height="7" transform="rotate(0,122.5,143.5)"/><rect x="126" y="140" width="7" height="7" transform="rotate(0,129.5,143.5)"/><rect x="140" y="140" width="7" height="7" transform="rotate(0,143.5,143.5)"/><rect x="147" y="140" width="7" height="7" transform="rotate(0,150.5,143.5)"/><rect x="161" y="140" width="7" height="7" transform="rotate(0,164.5,143.5)"/><rect x="182" y="140" width="7" height="7" transform="rotate(0,185.5,143.5)"/><rect x="196" y="140" width="7" height="7" transform="rotate(0,199.5,143.5)"/><rect x="210" y="140" width="7" height="7" transform="rotate(0,213.5,143.5)"/><rect x="28" y="147" width="7" height="7" transform="rotate(0,31.5,150.5)"/><rect x="35" y="147" width="7" height="7" transform="rotate(0,38.5,150.5)"/><rect x="42" y="147" width="7" height="7" transform="rotate(0,45.5,150.5)"/><rect x="49" y="147" width="7" height="7" transform="rotate(0,52.5,150.5)"/><rect x="91" y="147" width="7" height="7" transform="rotate(0,94.5,150.5)"/><rect x="98" y="147" width="7" height="7" transform="rotate(0,101.5,150.5)"/><rect x="112" y="147" width="7" height="7" transform="rotate(0,115.5,150.5)"/><rect x="147" y="147" width="7" height="7" transform="rotate(0,150.5,150.5)"/><rect x="21" y="154" width="7" height="7" transform="rotate(0,24.5,157.5)"/><rect x="28" y="154" width="7" height="7" transform="rotate(0,31.5,157.5)"/><rect x="42" y="154" width="7" height="7" transform="rotate(0,45.5,157.5)"/><rect x="49" y="154" width="7" height="7" transform="rotate(0,52.5,157.5)"/><rect x="56" y="154" width="7" height="7" transform="rotate(0,59.5,157.5)"/><rect x="77" y="154" width="7" height="7" transform="rotate(0,80.5,157.5)"/><rect x="98" y="154" width="7" height="7" transform="rotate(0,101.5,157.5)"/><rect x="105" y="154" width="7" height="7" transform="rotate(0,108.5,157.5)"/><rect x="133" y="154" width="7" height="7" transform="rotate(0,136.5,157.5)"/><rect x="154" y="154" width="7" height="7" transform="rotate(0,157.5,157.5)"/><rect x="161" y="154" width="7" height="7" transform="rotate(0,164.5,157.5)"/><rect x="168" y="154" width="7" height="7" transform="rotate(0,171.5,157.5)"/><rect x="175" y="154" width="7" height="7" transform="rotate(0,178.5,157.5)"/><rect x="182" y="154" width="7" height="7" transform="rotate(0,185.5,157.5)"/><rect x="70" y="161" width="7" height="7" transform="rotate(0,73.5,164.5)"/><rect x="77" y="161" width="7" height="7" transform="rotate(0,80.5,164.5)"/><rect x="91" y="161" width="7" height="7" transform="rotate(0,94.5,164.5)"/><rect x="98" y="161" width="7" height="7" transform="rotate(0,101.5,164.5)"/><rect x="112" y="161" width="7" height="7" transform="rotate(0,115.5,164.5)"/><rect x="119" y="161" width="7" height="7" transform="rotate(0,122.5,164.5)"/><rect x="126" y="161" width="7" height="7" transform="rotate(0,129.5,164.5)"/><rect x="147" y="161" width="7" height="7" transform="rotate(0,150.5,164.5)"/><rect x="154" y="161" width="7" height="7" transform="rotate(0,157.5,164.5)"/><rect x="182" y="161" width="7" height="7" transform="rotate(0,185.5,164.5)"/><rect x="203" y="161" width="7" height="7" transform="rotate(0,206.5,164.5)"/><rect x="77" y="168" width="7" height="7" transform="rotate(0,80.5,171.5)"/><rect x="84" y="168" width="7" height="7" transform="rotate(0,87.5,171.5)"/><rect x="98" y="168" width="7" height="7" transform="rotate(0,101.5,171.5)"/><rect x="105" y="168" width="7" height="7" transform="rotate(0,108.5,171.5)"/><rect x="112" y="168" width="7" height="7" transform="rotate(0,115.5,171.5)"/><rect x="119" y="168" width="7" height="7" transform="rotate(0,122.5,171.5)"/><rect x="133" y="168" width="7" height="7" transform="rotate(0,136.5,171.5)"/><rect x="154" y="168" width="7" height="7" transform="rotate(0,157.5,171.5)"/><rect x="168" y="168" width="7" height="7" transform="rotate(0,171.5,171.5)"/><rect x="182" y="168" width="7" height="7" transform="rotate(0,185.5,171.5)"/><rect x="196" y="168" width="7" height="7" transform="rotate(0,199.5,171.5)"/><rect x="210" y="168" width="7" height="7" transform="rotate(0,213.5,171.5)"/><rect x="70" y="175" width="7" height="7" transform="rotate(0,73.5,178.5)"/><rect x="77" y="175" width="7" height="7" transform="rotate(0,80.5,178.5)"/><rect x="91" y="175" width="7" height="7" transform="rotate(0,94.5,178.5)"/><rect x="98" y="175" width="7" height="7" transform="rotate(0,101.5,178.5)"/><rect x="112" y="175" width="7" height="7" transform="rotate(0,115.5,178.5)"/><rect x="126" y="175" width="7" height="7" transform="rotate(0,129.5,178.5)"/><rect x="140" y="175" width="7" height="7" transform="rotate(0,143.5,178.5)"/><rect x="154" y="175" width="7" height="7" transform="rotate(0,157.5,178.5)"/><rect x="182" y="175" width="7" height="7" transform="rotate(0,185.5,178.5)"/><rect x="189" y="175" width="7" height="7" transform="rotate(0,192.5,178.5)"/><rect x="196" y="175" width="7" height="7" transform="rotate(0,199.5,178.5)"/><rect x="203" y="175" width="7" height="7" transform="rotate(0,206.5,178.5)"/><rect x="210" y="175" width="7" height="7" transform="rotate(0,213.5,178.5)"/><rect x="84" y="182" width="7" height="7" transform="rotate(0,87.5,185.5)"/><rect x="119" y="182" width="7" height="7" transform="rotate(0,122.5,185.5)"/><rect x="140" y="182" width="7" height="7" transform="rotate(0,143.5,185.5)"/><rect x="147" y="182" width="7" height="7" transform="rotate(0,150.5,185.5)"/><rect x="154" y="182" width="7" height="7" transform="rotate(0,157.5,185.5)"/><rect x="161" y="182" width="7" height="7" transform="rotate(0,164.5,185.5)"/><rect x="168" y="182" width="7" height="7" transform="rotate(0,171.5,185.5)"/><rect x="175" y="182" width="7" height="7" transform="rotate(0,178.5,185.5)"/><rect x="182" y="182" width="7" height="7" transform="rotate(0,185.5,185.5)"/><rect x="189" y="182" width="7" height="7" transform="rotate(0,192.5,185.5)"/><rect x="196" y="182" width="7" height="7" transform="rotate(0,199.5,185.5)"/><rect x="203" y="182" width="7" height="7" transform="rotate(0,206.5,185.5)"/><rect x="70" y="189" width="7" height="7" transform="rotate(0,73.5,192.5)"/><rect x="112" y="189" width="7" height="7" transform="rotate(0,115.5,192.5)"/><rect x="126" y="189" width="7" height="7" transform="rotate(0,129.5,192.5)"/><rect x="140" y="189" width="7" height="7" transform="rotate(0,143.5,192.5)"/><rect x="147" y="189" width="7" height="7" transform="rotate(0,150.5,192.5)"/><rect x="168" y="189" width="7" height="7" transform="rotate(0,171.5,192.5)"/><rect x="189" y="189" width="7" height="7" transform="rotate(0,192.5,192.5)"/><rect x="203" y="189" width="7" height="7" transform="rotate(0,206.5,192.5)"/><rect x="70" y="196" width="7" height="7" transform="rotate(0,73.5,199.5)"/><rect x="77" y="196" width="7" height="7" transform="rotate(0,80.5,199.5)"/><rect x="98" y="196" width="7" height="7" transform="rotate(0,101.5,199.5)"/><rect x="105" y="196" width="7" height="7" transform="rotate(0,108.5,199.5)"/><rect x="119" y="196" width="7" height="7" transform="rotate(0,122.5,199.5)"/><rect x="126" y="196" width="7" height="7" transform="rotate(0,129.5,199.5)"/><rect x="133" y="196" width="7" height="7" transform="rotate(0,136.5,199.5)"/><rect x="140" y="196" width="7" height="7" transform="rotate(0,143.5,199.5)"/><rect x="147" y="196" width="7" height="7" transform="rotate(0,150.5,199.5)"/><rect x="154" y="196" width="7" height="7" transform="rotate(0,157.5,199.5)"/><rect x="161" y="196" width="7" height="7" transform="rotate(0,164.5,199.5)"/><rect x="175" y="196" width="7" height="7" transform="rotate(0,178.5,199.5)"/><rect x="182" y="196" width="7" height="7" transform="rotate(0,185.5,199.5)"/><rect x="210" y="196" width="7" height="7" transform="rotate(0,213.5,199.5)"/><rect x="70" y="203" width="7" height="7" transform="rotate(0,73.5,206.5)"/><rect x="77" y="203" width="7" height="7" transform="rotate(0,80.5,206.5)"/><rect x="84" y="203" width="7" height="7" transform="rotate(0,87.5,206.5)"/><rect x="91" y="203" width="7" height="7" transform="rotate(0,94.5,206.5)"/><rect x="105" y="203" width="7" height="7" transform="rotate(0,108.5,206.5)"/><rect x="112" y="203" width="7" height="7" transform="rotate(0,115.5,206.5)"/><rect x="126" y="203" width="7" height="7" transform="rotate(0,129.5,206.5)"/><rect x="140" y="203" width="7" height="7" transform="rotate(0,143.5,206.5)"/><rect x="168" y="203" width="7" height="7" transform="rotate(0,171.5,206.5)"/><rect x="182" y="203" width="7" height="7" transform="rotate(0,185.5,206.5)"/><rect x="196" y="203" width="7" height="7" transform="rotate(0,199.5,206.5)"/><rect x="203" y="203" width="7" height="7" transform="rotate(0,206.5,206.5)"/><rect x="84" y="210" width="7" height="7" transform="rotate(0,87.5,213.5)"/><rect x="91" y="210" width="7" height="7" transform="rotate(0,94.5,213.5)"/><rect x="98" y="210" width="7" height="7" transform="rotate(0,101.5,213.5)"/><rect x="119" y="210" width="7" height="7" transform="rotate(0,122.5,213.5)"/><rect x="154" y="210" width="7" height="7" transform="rotate(0,157.5,213.5)"/><rect x="161" y="210" width="7" height="7" transform="rotate(0,164.5,213.5)"/><rect x="168" y="210" width="7" height="7" transform="rotate(0,171.5,213.5)"/><rect x="203" y="210" width="7" height="7" transform="rotate(0,206.5,213.5)"/></g></svg>';

const ok = (sessionId, type, payload = {}) => ({
  status: "ok",
  type,
  session_id: sessionId,
  ...payload,
});

const fail = (sessionId, errorCode, errorText) => ({
  status: "fail",
  type: "mock_user_intent",
  session_id: sessionId,
  error_code: errorCode,
  error_text: errorText,
});

const buildTechMessage = (sessionId, overrides = {}) =>
  ok(sessionId, "tech", {
    face_in_area: false,
    mic_on: false,
    mic_in_progress: false,
    i_am_thinking: false,
    ...overrides,
  });

const buildMeasurementResults = (completedMeasurements) =>
  MEASUREMENT_PLAN.map((type) => ({
    type,
    completed: completedMeasurements.includes(type),
  }));

const buildResultsIntro = (completedMeasurements) =>
  MEASUREMENT_PLAN.map((type) => {
    const completed = completedMeasurements.includes(type);

    return {
      type,
      completed,
      deviations_count: completed ? countDeviations(type) : 0,
    };
  });

const buildParamsMessage = (sessionId, completedMeasurements) =>
  ok(sessionId, "params", buildParamsFixture(completedMeasurements));

const createCompletedCheckup = (testId, testName, attributes, now) => ({
  checkup_id: randomUUID(),
  created_at: now,
  updated_at: now,
  status: "completed",
  results: [
    {
      test_id: testId,
      test_name: testName,
      attributes,
    },
  ],
});

const attribute = (name, indicator, value, unit = null) => ({
  name,
  indicator,
  type: "string",
  value,
  unit,
});

const buildMeasurementSnapshot = (sessionId, completedMeasurements, revision) => {
  const now = new Date().toISOString();
  const heartCompleted = completedMeasurements.includes("heart_and_vessels");
  const skinCompleted = completedMeasurements.includes("skin");
  const visionCompleted = completedMeasurements.includes("vision");
  const completedCount = completedMeasurements.length;

  const zone = (zoneId, zoneName, completed, checkups) => ({
    zone_id: zoneId,
    zone_name: zoneName,
    status: completed ? "completed" : "not_started",
    checkups: completed ? checkups : [],
  });

  return {
    status: "ok",
    type: "measurement_snapshot",
    event_id: randomUUID(),
    session_id: sessionId,
    revision,
    observed_at: now,
    data: {
      session_id: sessionId,
      created_at: now,
      updated_at: now,
      status: completedCount === MEASUREMENT_PLAN.length ? "ended" : "in_progress",
      zones: [
        zone("fpg", "Зона фотоплетизмографии", heartCompleted, [
          createCompletedCheckup(
            "general",
            "Общие показатели",
            [
              attribute("Пульс", "hr", "72", "уд/мин"),
              attribute("Уровень стресса", "stress", "38"),
            ],
            now,
          ),
        ]),
        zone("cardio", "Зона кардио", heartCompleted, [
          createCompletedCheckup(
            "cardio",
            "Кардиокарта",
            [
              attribute("ЧСС", "heart_rate", "72", "уд/мин"),
              attribute("Интервал QT", "qt", "410", "мс"),
            ],
            now,
          ),
        ]),
        zone("derm", "Зона кожи", skinCompleted, [
          createCompletedCheckup(
            "skin",
            "Кожа",
            [
              attribute("Жирный блеск", "greasy_shine", "18", "%"),
              attribute("Покраснение", "redness", "7", "%"),
            ],
            now,
          ),
        ]),
        zone("vision", "Зона зрения", visionCompleted, [
          createCompletedCheckup(
            "acuity",
            "Тест на остроту зрения",
            [
              attribute("Острота левого глаза", "leftEyeAcuity", "1.0"),
              attribute("Острота правого глаза", "rightEyeAcuity", "1.0"),
            ],
            now,
          ),
        ]),
      ],
    },
  };
};

module.exports = {
  QR_SVG,
  MEASUREMENT_PLAN,
  buildMeasurementResults,
  buildParamsMessage,
  buildMeasurementSnapshot,
  buildResultsIntro,
  buildTechMessage,
  fail,
  ok,
};
