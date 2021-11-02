
function telop() {
    var waarde1 = document.getElementById('invoer1').value;
    var waarde2 = document.getElementById('invoer2').value;
    var waarde3 = Number.parseInt(waarde1) + Number.parseInt(waarde2);
    console.log('tel op werkt');
    alert(waarde3);
}
function telmin() {
    var waarde1 = document.getElementById('invoer1').value;
    var waarde2 = document.getElementById('invoer2').value;
    var waarde3 = Number.parseInt(waarde1) - Number.parseInt(waarde2);
    console.log('tel min werkt');
    alert(waarde3);
}
function teldeel() {
    var waarde1 = document.getElementById('invoer1').value;
    var waarde2 = document.getElementById('invoer2').value;
    var waarde3 = Number.parseInt(waarde1) / Number.parseInt(waarde2);
    console.log('tel deel werkt');
    alert(waarde3);
}
function telmaal() {
    var waarde1 = document.getElementById('invoer1').value;
    var waarde2 = document.getElementById('invoer2').value;
    var waarde3 = Number.parseInt(waarde1) * Number.parseInt(waarde2);
    console.log('tel maal werkt');
    alert(waarde3);
}