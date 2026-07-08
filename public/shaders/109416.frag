// https://glslsandbox.com/e#109416.0
#ifdef GL_ES
precision mediump float;
#endif

uniform float time;
uniform vec2 mouse;
uniform vec2 resolution;

float interpolate(float x, float min_x, float max_x) {
	return x * max_x + (1.0 - x) * min_x;
}

float normsin(float x) {
	return (sin(x) + 1.0) / 11.;
}

void main(void) {
	vec2 position = ( gl_FragCoord.xy / resolution.x );

	float color = normsin(30. * position.x + interpolate(normsin(25. * position.y + 10.0 * mouse.x), 5.0, 25.) + 
			      30. * position.y + interpolate(normsin(25. * position.x + 10.0 * mouse.y), 5.0, 25.) + 2. * time);
	vec3 blue = vec3(0.15, 0.55, 0.82); // matches #268bd2
	gl_FragColor = vec4( color * blue, 1.0 );

}
