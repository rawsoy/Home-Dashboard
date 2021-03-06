const Mustache = require("mustache");
const calendarAuth = require('./auth/CalendarAuth');
const google = require('googleapis');
require('datejs');

const REFRESH_RATE = 600;  // seconds
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"];


var calendar = google.calendar('v3');
// today.setMonth(today.getMonth()+1);


function listEvents(auth, callback) {
    var eventData = {};

    // Bounds of query
    var prevMonth = Date.today().add(-1).months();
    prevMonth.setDate(20);
    var nextMonth =  Date.today().add(+1).months();
    nextMonth.setDate(8);

    calendar.events.list({
        auth: auth,
        calendarId: 'primary',
        timeMin: prevMonth.toISOString(),
        timeMax: nextMonth.toISOString(),
        maxResults: 500,
        singleEvents: true,
        orderBy: 'startTime'
    }, function(err, response) {
        if (err) {
            console.log('The API returned an error: ' + err);
            return;
        }
        var events = response.items;
        if (events.length == 0) {
            console.log('No upcoming events found.');
        } else {
            // listCalendars(auth);
            eventData = parseEvents(events);
        }
        callback(eventData);
    });
}

function listCalendars(auth) {
    calendar.calendarList.list({
        auth: auth,
        maxResults: 5
    }, function(err, response) {
        if (err) {
            console.log('The API returned an error: ' + err);
            return;
        }
        var calendars = response.items;
        if (calendars.length == 0) {
            console.log('No upcoming events found.');
        } else {
            for (var i = 0; i < calendars.length; i++) {
                console.log(calendars[i]);
            }
        }
    });
}


// Parse events into event data for mustache
function parseEvents(events) {
    var eventData = {};
    for (var i = 0; i < events.length; i++) {
        var event = events[i];
        var start = event.start.dateTime || event.start.date;
        var end = event.end.dateTime || event.end.date;
        var startDate = new Date(start);
        var endDate = new Date(end);

        // console.log("%s - %s", startDate, event.summary);
        // console.log("%s - %s", endDate, event.summary);

         // All day event: time zone must be set to UTC +0
        if (start.indexOf("T") == -1) {
            // Will change the time and date, but not the time zone tag
            var timeZone = startDate.getTimezoneOffset() / 60;
            startDate.setUTCHours(timeZone);
            var dateStr = startDate.getFullYear() + "-" + (startDate.getMonth()+1) + "-" + startDate.getDate();
            if (eventData[dateStr] == null) {
                eventData[dateStr] = [];
            }
            eventData[dateStr].push({
                "summary": event.summary,
                "start": "All Day"
            });
        }

        // Add to events data
        else if (startDate.getDate() == endDate.getDate()) { // single day event
            var dateStr = startDate.getFullYear() + "-" + (startDate.getMonth()+1) + "-" + startDate.getDate();
            if (eventData[dateStr] == null) {
                eventData[dateStr] = [];
            }
            eventData[dateStr].push({
                "summary": event.summary,
                "start": startDate.toString("h:mmtt")
            });

        // multi day event
        } else {
            for (j = startDate.getDate(); j <= endDate.getDate(); j++) {
                var dateStr = startDate.getFullYear() + "-" + (startDate.getMonth()+1) + "-" + j;
                if (eventData[dateStr] == null) {
                    eventData[dateStr] = [];
                }

                var startLabel = "All Day";
                if (j == startDate.getDate()) { // fist day of multi day event
                    startLabel = startDate.toString("h:mmtt");
                } else if (j == endDate.getDate()) { // last day
                    startLabel = "12:00 AM"
                }

                eventData[dateStr].push({
                    "summary": event.summary,
                    "start": startLabel
                });
            }
        }
    }
    return eventData;
}


function render(eventData) {
    var data = {};

    // Current day
    data.currentDay = DOW[Date.today().getDay()] +
                        ", " + MONTHS[Date.today().getMonth()] +
                         " " + ordinalSuffixOf(Date.today().getDate());

    // Days of week
    data.dow = [];
    for (var i = 0; i < 7; i++) {
        data.dow.push({"dowTitle": DOW[i].charAt(0)});
    }

    // Calculate start and end of the month
    var firstDOM = Date.today().clearTime().moveToFirstDayOfMonth().getDay();
    var numDaysInMonth = Date.getDaysInMonth(Date.today().getYear(), Date.today().getMonth());
    var prevMonth = (-1).months().fromNow();
    var numDaysInPrevMonth = Date.getDaysInMonth(prevMonth.getYear(), prevMonth.getMonth());

    var currDay = 1;
    var currDayOffMonth = 1;
    var prevMonthDayOffset = firstDOM-1;

    data.weeks = [];
    var numRows = Math.ceil((numDaysInMonth+firstDOM)/7.0);
    data.weekHeight = 100/numRows; // dynamically calc week height
    for (var i = 1; i <= numRows ; i++) { // Only create necessary # rows in calendar

        data.weeks.push([{"weekNumber": i}]);

        // Days
        data.weeks[i-1].days = [];
        for (var j = 0; j < 7; j++) {

            // Make sure day number is in the current month
            var isToday = currDay === Date.today().getDate();

            if (currDay <= numDaysInMonth && (j >= firstDOM || i > 1)) {
                currDayOffMonth = 1;
                data.weeks[i-1].days.push({
                    "dayNumber": currDay,
                    "dayColor": isToday ? "today" : "",
                    "dayBackground": isToday ? "todayBackground" : ""
                });

                var dateOfEvent = new Date(Date.today().valueOf());
                dateOfEvent.setDate(currDay);
                initEvents(dateOfEvent, data.weeks[i-1].days[j], eventData);
                currDay++;

            // Else either before or after this month
            } else {
                var currDayLabel = (j < firstDOM && i <= 1) ? numDaysInPrevMonth - prevMonthDayOffset : currDayOffMonth;
                if (j < firstDOM && i <= 1) {
                    prevMonthDayOffset -= 1;
                } else {
                    currDayOffMonth++;
                }

                data.weeks[i-1].days.push({
                    "dayNumber": currDayLabel,
                    "dayColor": "off-month"
                });

                dateOfEvent = (j < firstDOM && i <= 1) ?  Date.today().add(-1).months() : Date.today().add(+1).months();
                dateOfEvent.setDate(currDayLabel);
                initEvents(dateOfEvent, data.weeks[i-1].days[j], eventData);
            }
        }
    }

    // Render
    $.get('./_view/calendarCard.mustache', function(template) {
       var rendered = Mustache.render(template, data);
       $('#calendar-card').html(rendered);
    });
}


// Init events mustache data
function initEvents(dateOfEvent, data, eventData) {
    var dateLabel = dateOfEvent.getFullYear() + "-" + (dateOfEvent.getMonth()+1) + "-" + dateOfEvent.getDate();
    data.events = [];
    if (eventData[dateLabel] != null) {
        for (var k = 0; k < eventData[dateLabel].length; k++) {
            data.events.push({
                "eventTitle": eventData[dateLabel][k].summary,
                "eventTime": eventData[dateLabel][k].start
            });
        }
    }
}


function ordinalSuffixOf(i) {
    var j = i % 10, k = i % 100;
    if (j == 1 && k != 11) { return i + "st"; }
    if (j == 2 && k != 12) { return i + "nd"; }
    if (j == 3 && k != 13) { return i + "rd"; }
    return i + "th";
}

// set month and year of prev month. day needs to be set depending on use case.
function prevMonthDate(currDate) {
    var prev = new Date(currDate.valueOf());
    if (currDate.getMonth() === 1) {
        prev.setMonth(12);
        prev.setFullYear(currDate.getFullYear()-1);
    } else {
        prev.setMonth(currDate.getMonth()-1);
    }
    return prev;
}

// set month and year of next month. day needs to be set depending on use case.
function nextMonthDate(currDate) {
    var next = new Date(currDate.valueOf());
    if (currDate.getMonth() === 12) {
        next.setMonth(1);
        next.setFullYear(currDate.getFullYear()+1);
    } else {
        next.setMonth(currDate.getMonth()+1);
    }
    return next;
}

function load() {
    calendarAuth.authorize(function(auth) {
        listEvents(auth, function(eventData) {
            render(eventData);
        });
    });
}


$(document).ready(function() {

    load();
    window.setInterval(function() {
        console.log("Reloading calendar data...");
        load();
    }, REFRESH_RATE*1000);

});
