---
layout: page
title: Tutorial：LED Sousa Bell
---

<iframe width="560" height="315" src="https://www.youtube.com/embed/QO5Y-jYbiPA" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>

Many thanks to the [Brooklyn College Sonic Arts](http://www.brooklyn.cuny.edu/web/academics/centers/ccm/education/sonicarts.php) program and the [Performance And Interactive Media Arts](https://www.pima-brooklyncollege.info/) program!

[Click here](https://www.youtube.com/watch?v=K3kPgxQ373U) for a compilation of short clips I recorded while I was making the bell.

If you haven’t soldered before, Nic Collins’ book [Handmade Electronic Music](https://www.nicolascollins.com/handmade.htm) is a great way to learn how.

Adafruit has a [soldering guide](https://learn.adafruit.com/make-it-glow-how-to-solder-neopixels-a-beginners-guide) specifically for LEDs.

If you are unfamiliar with Max/MSP, [check out the tutorials.](https://docs.cycling74.com/max8)

Also, check out [Jay Converse’s LED bell](https://www.facebook.com/TubaGuyFairfax) because it’s cool too.


### Materials

* One dedicated sousaphone bell (this is a permanent installation) I used a fiberglass bell spray-painted black. the LEDs will stick to a lacquered bell just as well, but keep in mind that the LEDs will be soldered while they’re on the bell, which would not do the lacquer any favors.
* [Condenser clip-on mic](https://www.audio-technica.com/cms/wired_mics/8b8850105bdc46d6/index.html) My max patch currently only uses amplitude data from the mic. It’s definitely possible to use a much cheaper mic, or even [solder your own](https://learn.adafruit.com/adafruit-agc-electret-microphone-amplifier-max9814).
* [Audio interface](https://www.reddit.com/r/audioengineering/wiki/faq#wiki_how_do_i_record_with_my_computer.3F__what.27s_an_interface.3F)
* [Max/MSP](https://cycling74.com/)
* [Teensy 3.2](https://www.pjrc.com/store/teensy32.html)
* [OctoWS2811](https://www.pjrc.com/store/octo28_adaptor.html)
* [Header pins](https://www.pjrc.com/store/header_14x1.html)
* [Sockets](https://www.pjrc.com/store/socket_14x1.html)
* [WS2812b RGB LED](https://www.amazon.com/Programmable-Aclorol-Individually-Addressable-Raspberry/dp/B07BKNS7DJ) (200 LEDs needed for this tutorial, but definitely buy extras. Even the pros sometimes have trouble sourcing good ones that won’t burn out quickly) WS2812 LEDs were released to the world 7 years ago, and they’ve been improved upon since then. [Click here](https://hackaday.com/2019/03/26/can-you-live-without-the-ws2812/) to read more about other types of LEDs.
* [5V 50W PSU](https://www.aliexpress.com/item/4000221993487.html)
* [Soldering Iron](https://www.testequipmentdepot.com/weller/soldering/soldering-stations/digital-we-soldering-station-120v-70w-we1010.htm) (I bought a cheap soldering iron, hated it, then splurged on the Weller, which is great)
* [Helping hands](https://www.amazon.com/Neiko-01902-Adjustable-Magnifying-Alligator/dp/B000P42O3C)
* [lead solder](https://www.amazon.com/WYCTIN-Diameter-Electrical-Soldering-Purpose/dp/B071WQ9X5K) (leadless solder is a PITA)
* Electrical tape and Gorilla tape
* [Micro USB cable](https://www.digikey.com/short/zb93pw)
* [USB extension cable](https://www.digikey.com/short/zb93z3)
* [Barrel extension cable](https://www.digikey.com/short/zb934t)
* [XLR cable](https://www.monoprice.com/product?p_id=4754)
* [CAT6 cable](https://www.monoprice.com/product?p_id=9789)
* [Stranded wire 22 AWG](https://www.pololu.com/product/2640)
* Projector and tripod (the tripod matters more than the projector. It must remain completely stationary for however long it takes you to place all of the LEDs on the bell)


### Initial Setup

[Click here](https://www.pjrc.com/store/octo28_adaptor.html) for instructions on how to connect the OctoWS2811, Teensy 3.2, power supply, and LEDs. This is to make sure everything works before it’s installed on the bell.

Download [this folder o’ files](https://drive.google.com/drive/folders/1zNywJd1qFBDvmCKHP6uyBZwvYQ1FHMPt?usp=sharing) If the Google Drive link ever goes down then the files are also available [here](https://github.com/jbaylies/Electrobrass_Encyclopedia/tree/master/docs/content/tutorials/data).

Upload success.ino to the teensy by following [these instructions.](https://www.pjrc.com/teensy/teensyduino.html)

This part of the code is the most important, and may need to be changed.

{% highlight cpp %}
  const int ledsPerStrip = 26;
  const int numStrips = 8;
{% endhighlight %}

* Open testpatch1.maxpat
* Turn the patch’s audio on.
* Clear the serial ports and locate the teensy.
* Enable jit.world, and the LEDs should light up...


Getting the Coordinates
-----------------------

Here’s how I got the coordinates for `remappedLEDcoordinates.txt`

I found [this website](http://iwant2study.org/lookangejss/math/Series_Numbers/ejss_model_FibonacciSpiral/) clicked “table”, selected the first 200 coordinates, copy-pasted them into google sheets, exported the sheet as a csv file, and used [Justin G’s max patch](https://cycling74.com/forums/importing-from-excel-csv-questions) to convert the csv file into Max’s coll object.

then,

![max-scale-coords.png](../media/max-scale-coords.png)

This patch will get the Fib. Spiral showing up properly in jit.world

![flipped-on-xaxis.png](../media/flipped-on-xaxis.png)

Left, incorrect, flipped on x-axis. Right, correct. (challenge: turn the coordinates 90 degrees. It’d look more symmetrical.)


### Arranging the LEDs

Take a screenshot of the spiral in jit.world (or use the one provided above), and use a projector to project it onto your sousaphone bell. This will be where you place your LEDs. I found that it is easier to place the LEDs while the projector is on than it is to mark the spots with a marker and then put the LEDs on top of the marked spots. Once completed, the bell will look best from the point of view of where the projector was while you were placing the LEDs

One problem I faced is that I placed half the LEDs, then took a break for a few days, and when I tried to set up the projector again I learned that realigning the projector perfectly is impossible. This led to one speck of light hitting the flare of the bell the first time, and the throat of the bell the second time, which made me place one extra LED, which led to much confusion later on.

You'll want to wire the 200 LEDs in eight groups of 25. You should use your own discretion to do this as efficiently as possible. You can use my wiring diagram below as a guideline, but be warned that it’s flipped on its X axis, and I had to account for one extra LED. Fibonacci index #29 corresponds to wiring index #35 and #170.

![numbered-indices.jpeg](../media/numbered-indices.jpeg)

I used this diagram to reorder the coordinates from the Fibonacci spiral order to my wiring order.

The top numbers are the Fibonacci indices, which can be obtained from [here](http://iwant2study.org/lookangejss/math/Series_Numbers/ejss_model_FibonacciSpiral/) by clicking ``number``. The bottom numbers are the wiring indices. I did not plan out the wiring indices in advance. I simply turned on the first LED in each of the eight chains and wrote down the wiring indices on the above chart.

Then I typed all of those indices into a coll object, 
which allowed me to reorder the coordinates properly using the patch pictured below.

![coll-reorder.png](../media/coll-reorder.png)

This essentially makes the whole thing a big, low-resolution TV screen.

...and that’s all the info you need to do this yourself. Best of luck! Note that the audio-reactive visuals are outside the scope of this tutorial. If you'd like to check out the visualizers I've put together for my bell, they're located [here](https://github.com/jbaylies/sousastep/tree/main/Sousastep%20Visual%20FX).
